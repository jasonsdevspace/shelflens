import type { Rule } from '@jasonsdevspace/shelflens';
import {
    createMemoryEventStore,
    createMemoryRuleStore,
    PERSISTED_OPERATIONS,
} from '@shelflens/api';
import { act, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryCatalogStore } from '../worker/catalog-db.js';
import { createWorkerApi } from '../worker/handle.js';
import { StoreDidNotStart, WorkerUnsupported } from '../worker/register.js';
import { parseCsv } from './csv.js';
import { CATALOG_FILE_BYTES_CAP } from './limits.js';
import { guessMapping } from './mapping.js';
import { SAMPLE_FILE, sampleCsv } from './sample.js';
import { toCatalog } from './to-catalog.js';
import { TryPage } from './TryPage.jsx';

// Each wait here goes through the store's own handler and a stand-in for IndexedDB, which
// a loaded run can keep past the usual second, so every wait in this file allows five.
configure({ asyncUtilTimeout: 5000 });

/*
 * The page for a visitor's own catalog, over the real worker for try/ in
 * memory, with a way to make any one request fail, since a failure in a
 * real browser is the one thing the browser test cannot make happen.
 */

const BASE = '/try/';

type Failure = (request: Request) => Promise<Response> | undefined;
let failure: Failure | undefined;
let sample: () => Promise<Response>;

const page = () => {
    const rules = createMemoryRuleStore();
    const worker = createWorkerApi({
        catalogs: createMemoryCatalogStore(),
        base: BASE,
        events: createMemoryEventStore(),
        rules,
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(
            new URL(String(input instanceof Request ? input.url : input), window.location.href),
            init
        );
        const failed = failure?.(request);
        if (failed) return failed;
        if (new URL(request.url).pathname.endsWith(SAMPLE_FILE)) return sample();
        return (await worker.handle(request)) ?? new Response('not found', { status: 404 });
    });
    render(<TryPage ready={Promise.resolve()} base={BASE} />);
    return { rules, worker };
};

/**
 * Presses a button again once the page has handled the answer to its first press, and before it
 * draws what comes next, as a quick second click can land in a browser. Inside act the page draws
 * only once the callback is done. `handled` says the page's own step after the answer has run,
 * and one more turn lets whatever it began settle, so the press never lands while the first one
 * is still with the worker.
 */
const pressBetween = async (button: HTMLElement, answer: () => void, handled: () => boolean) => {
    await act(async () => {
        answer();
        for (let turn = 0; turn < 50 && !handled(); turn += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        expect(handled()).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        button.click();
    });
};

/** One saved rule, as the panel would save it. Only whether it exists matters here. */
const SAVED: Rule[] = [{ id: 'pin', pin: ['SL-00001'] }];

const failWhen =
    (method: string, path: string, answer: () => Promise<Response>): Failure =>
    (request) =>
        request.method === method && new URL(request.url).pathname === path ? answer() : undefined;

const chooser = () => screen.findByRole('heading', { level: 1, name: 'Search your own products' });

/** The page's alert, once it says this. It is in the page empty first, so it is heard when it fills. */
const alerted = (text: string | RegExp) =>
    waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text));

/** A line shown on the page and said in a status region that was empty when it mounted. */
const heard = async (line: string) => {
    expect(screen.getByText(line, { selector: 'p.notice' })).toBeInTheDocument();
    await waitFor(() =>
        expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain(line)
    );
};

const loadSample = async () => {
    await chooser();
    await userEvent.click(
        screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Search 200 products' }));
    await screen.findByText(/the 200 products you loaded/);
};

beforeEach(() => {
    failure = undefined;
    sample = () => Promise.resolve(new Response(sampleCsv()));
    window.history.replaceState(null, '', BASE);
    localStorage.setItem('shelflens.tour', 'seen');
    expect(Object.keys(PERSISTED_OPERATIONS).length).toBeGreaterThan(0);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('the page for a visitor’s own catalog', () => {
    it('loads the sample and searches it, saying whose catalog it is', async () => {
        page();
        await loadSample();
        expect(
            await screen.findByRole('combobox', { name: 'Search the store' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Tour' })).not.toBeInTheDocument();
    });

    it('says the sample could not be loaded rather than reading an error page as products', async () => {
        sample = () => Promise.resolve(new Response('<html>not here</html>', { status: 404 }));
        page();
        await chooser();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await alerted('The sample could not be loaded (error 404)');
    });

    it('goes back to the review with a way to try again when the store cannot be reached', async () => {
        failure = failWhen('PUT', `${BASE}catalog`, () =>
            Promise.reject(new Error('the worker stopped'))
        );
        page();
        await chooser();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Search 200 products' }));
        await alerted(
            'The store could not be reached (the worker stopped). Press “Search 200 products” to try again.'
        );
        failure = undefined;
        await userEvent.click(screen.getByRole('button', { name: 'Search 200 products' }));
        await screen.findByText(/the 200 products you loaded/);
    });

    it('says when the store refuses the products, in its own words', async () => {
        failure = failWhen('PUT', `${BASE}catalog`, () =>
            Promise.resolve(
                Response.json(
                    { errors: [{ message: 'the catalog has no products' }] },
                    { status: 400 }
                )
            )
        );
        page();
        await chooser();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Search 200 products' }));
        await alerted('The store could not use these products, since the catalog has no products.');
    });

    it('reads a browser’s own reason after “since” as the end of the sentence', async () => {
        failure = failWhen('PUT', `${BASE}catalog`, () =>
            Promise.resolve(
                Response.json(
                    { errors: [{ message: 'The quota has been exceeded.' }] },
                    // As the worker answers a catalog it could not build, with the browser's words.
                    { status: 400 }
                )
            )
        );
        page();
        await chooser();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Search 200 products' }));
        await alerted(
            'The store could not use these products, since the quota has been exceeded. Press “Search 200 products” to try again.'
        );
    });

    it('keeps the products, and says so, when removing them fails', async () => {
        page();
        await loadSample();
        let deletes = 0;
        failure = failWhen('DELETE', `${BASE}catalog`, () => {
            deletes += 1;
            return Promise.resolve(new Response(null, { status: 500 }));
        });
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        await alerted('Your products could not be removed (error 500), so they are still here.');
        expect(screen.getByText(/the 200 products you loaded/)).toBeInTheDocument();
        // A second failure in the same words empties the alert first, so it is heard again.
        const seen: string[] = [];
        const watch = new MutationObserver(() =>
            seen.push(document.querySelector('[role="alert"]')?.textContent ?? '')
        );
        watch.observe(document.body, { childList: true, subtree: true, characterData: true });
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        await waitFor(() => expect(deletes).toBe(2));
        await waitFor(() => expect(seen.at(-1)).toMatch(/could not be removed/));
        watch.disconnect();
        expect(seen).toContain('');
    });

    it('says when it is back that another tab removed the products, rather than failing to search', async () => {
        page();
        await loadSample();
        // As another tab removing them from the same worker.
        await fetch(`${BASE}catalog`, { method: 'DELETE' });
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await chooser();
        await heard('Your products were removed from this browser in another tab.');
        expect(screen.queryByRole('button', { name: 'Back to your products' })).toBeNull();
    });

    it('stays as it is when it is back and nothing changed', async () => {
        page();
        await loadSample();
        // What is loaded, read first, then given back to the tab's own read once it is held.
        const loaded: unknown = await (await fetch(`${BASE}catalog`)).json();
        let answer: () => void = () => undefined;
        let asked = false;
        failure = failWhen('GET', `${BASE}catalog`, () => {
            asked = true;
            return new Promise<Response>((resolve) => {
                answer = () => resolve(Response.json(loaded));
            });
        });
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await waitFor(() => expect(asked).toBe(true));
        await act(async () => {
            answer();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(screen.getByText(/the 200 products you loaded/)).toBeInTheDocument();
        expect(screen.queryByText(/Another tab loaded/)).toBeNull();
    });

    it('searches what another tab loaded when it is back, and says so', async () => {
        page();
        await loadSample();
        const table = parseCsv('name,price\nBench,120\nStool,40\n');
        const other = toCatalog(table, guessMapping(table));
        if (!other.ok) throw new Error(other.error);
        await fetch(`${BASE}catalog`, { method: 'PUT', body: JSON.stringify(other.catalog) });
        // A switch back to the tab, as most browsers say it.
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        // The store is built again over the other tab's products, which takes more than a moment
        // when the machine is busy.
        await screen.findByText(/the 2 products you loaded/);
        await heard('Another tab loaded 2 products, so these are what you are searching now.');
    });

    it('reads again on a return that came while an older read was out, so a change made meanwhile shows', async () => {
        page();
        await loadSample();
        const before: unknown = await (await fetch(`${BASE}catalog`)).json();
        // The first check's read is held, and answered with what was loaded before the change.
        let answer: () => void = () => undefined;
        let held = false;
        failure = (request) => {
            if (
                held ||
                request.method !== 'GET' ||
                new URL(request.url).pathname !== `${BASE}catalog`
            ) {
                return undefined;
            }
            held = true;
            return new Promise<Response>((resolve) => {
                answer = () => resolve(Response.json(before));
            });
        };
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await waitFor(() => expect(held).toBe(true));
        // Another tab loads other products, and the visitor comes back while the first read is out.
        const table = parseCsv('name,price\nBench,120\nStool,40\n');
        const other = toCatalog(table, guessMapping(table));
        if (!other.ok) throw new Error(other.error);
        await fetch(`${BASE}catalog`, { method: 'PUT', body: JSON.stringify(other.catalog) });
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await act(async () => {
            answer();
            await Promise.resolve();
        });
        await screen.findByText(/the 2 products you loaded/);
    });

    it('reads once when a return fires both a visibility change and a focus', async () => {
        page();
        await loadSample();
        let reads = 0;
        failure = (request) => {
            if (request.method === 'GET' && new URL(request.url).pathname === `${BASE}catalog`) {
                reads += 1;
            }
            return undefined;
        };
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
        });
        await waitFor(() => expect(reads).toBe(1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(reads).toBe(1);
    });

    it('removes the products and is back where a file is chosen, saying they were removed', async () => {
        page();
        await loadSample();
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        expect(await chooser()).toBeInTheDocument();
        await heard('Your products were removed from this browser.');
        // Nothing is loaded, so there is nothing to go back to.
        expect(screen.queryByRole('button', { name: /^Back to your/ })).toBeNull();
    });

    it('says the rules went too when the visitor agreed to remove them with the products', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace(SAVED);
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Yes, remove them' }));
        await chooser();
        await heard(
            'Your products and the rules you saved for them were removed from this browser.'
        );
    });

    it('goes back to the loaded products, and their search, from the chooser', async () => {
        page();
        await loadSample();
        act(() => window.history.replaceState(null, '', `${BASE}?q=bag`));
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        await userEvent.click(screen.getByRole('button', { name: 'Back to your products' }));
        await screen.findByText(/the 200 products you loaded/);
        expect(window.location.search).toBe('?q=bag');
    });

    it('goes back to the loaded products from a file looked at instead', async () => {
        page();
        await loadSample();
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File(['name,price\nBench,120\n'], 'bench.csv')
        );
        await screen.findByRole('heading', { level: 1, name: 'What is in bench.csv' });
        await userEvent.click(screen.getByRole('button', { name: 'Back to your products' }));
        await screen.findByText(/the 200 products you loaded/);
    });

    it('lets go of a file still being read when the way back finds the products gone', async () => {
        page();
        await loadSample();
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        let finish: (text: string) => void = (_text) => undefined;
        const slow = {
            name: 'slow.csv',
            size: 10,
            text: () =>
                new Promise<string>((resolve) => {
                    finish = resolve;
                }),
        };
        const input = screen.getByLabelText('Choose a file');
        Object.defineProperty(input, 'files', { value: [slow], configurable: true });
        act(() => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await screen.findByText('Reading slow.csv.');
        // Removed in another tab, as far as this one can tell.
        await fetch(`${BASE}catalog`, { method: 'DELETE' });
        await userEvent.click(screen.getByRole('button', { name: 'Back to your products' }));
        const gone =
            'Your products are no longer in this browser, so there is nothing to go back to.';
        await alerted(gone);
        await act(async () => {
            finish('name,price\nBench,120\n');
            await Promise.resolve();
        });
        // The read the visitor turned away from does not replace why the way back did nothing.
        expect(screen.queryByRole('heading', { name: 'What is in slow.csv' })).toBeNull();
        await alerted(gone);
    });

    it('keeps a file chosen while the way back is still reading the products', async () => {
        page();
        await loadSample();
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        let release: () => void = () => undefined;
        failure = failWhen(
            'GET',
            `${BASE}catalog`,
            () =>
                new Promise<Response>((_resolve, reject) => {
                    release = () => reject(new Error('late'));
                })
        );
        await userEvent.click(screen.getByRole('button', { name: 'Back to your products' }));
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File(['name,price\nBench,120\n'], 'bench.csv')
        );
        await screen.findByRole('heading', { level: 1, name: 'What is in bench.csv' });
        await act(async () => {
            release();
            await Promise.resolve();
        });
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What is in bench.csv');
        expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    });

    it('offers no way back once the products are replaced, even when reading them again fails', async () => {
        page();
        await loadSample();
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File(['name,price\nBench,120\n'], 'bench.csv')
        );
        await screen.findByRole('heading', { level: 1, name: 'What is in bench.csv' });
        failure = failWhen('GET', `${BASE}catalog`, () =>
            Promise.reject(new Error('the worker stopped'))
        );
        await userEvent.click(screen.getByRole('button', { name: 'Search 1 product' }));
        await alerted('The store could not be reached');
        expect(screen.queryByRole('button', { name: 'Back to your products' })).toBeNull();
    });

    it('reads a file dropped on the review, rather than losing the review to the browser', async () => {
        page();
        await chooser();
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File(['name,price\nBench,120\n'], 'first.csv')
        );
        await screen.findByRole('heading', { level: 1, name: 'What is in first.csv' });
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', {
            value: { files: [new File(['name,price\nStool,40\n'], 'second.csv')] },
        });
        act(() => {
            document.body.dispatchEvent(drop);
        });
        expect(drop.defaultPrevented).toBe(true);
        await screen.findByRole('heading', { level: 1, name: 'What is in second.csv' });
    });

    it('reads a file dropped anywhere on the chooser, not only on the drop area', async () => {
        page();
        await chooser();
        const file = new File(['name,price\nBench,120\n'], 'dropped.csv');
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
        act(() => {
            document.body.dispatchEvent(drop);
        });
        // The browser is kept from opening the file in the page's place.
        expect(drop.defaultPrevented).toBe(true);
        await screen.findByRole('heading', { level: 1, name: 'What is in dropped.csv' });
    });

    it('refuses a file past the row cap as it is read, before any mapping is shown', async () => {
        page();
        await chooser();
        const rows = Array.from({ length: 10_001 }, (_, index) => `Item ${index},1`).join('\n');
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File([`name,price\n${rows}\n`], 'too-many.csv')
        );
        await alerted(
            'This file has 10,001 rows, and the page takes up to 10,000 products. Delete rows until it has 10,000 or fewer, then choose it again.'
        );
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
            'Search your own products'
        );
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('shows the preview and the way on before the mapping, and marks the parts a store needs', async () => {
        page();
        await chooser();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        const search = await screen.findByRole('button', { name: 'Search 200 products' });
        const preview = screen.getByRole('list', { name: 'Preview' });
        const mapping = screen.getByRole('heading', {
            name: 'Where each part of a product comes from',
        });
        const before = (a: Element, b: Element) =>
            Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(before(preview, search)).toBe(true);
        expect(before(search, mapping)).toBe(true);
        for (const name of ['Name', 'Price']) {
            const field = screen.getByRole('combobox', { name });
            expect(field).toBeRequired();
            expect(field).toHaveAccessibleDescription('Needed');
        }
        expect(screen.getByRole('combobox', { name: 'Brand' })).not.toBeRequired();
    });

    it('leaves the last search behind when another file is chosen', async () => {
        page();
        await loadSample();
        act(() => window.history.replaceState(null, '', `${BASE}?q=bag&page=2`));
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        expect(window.location.search).toBe('');
    });

    it('asks before a new file replaces the products and their rules, and goes back to them when kept', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace(SAVED);
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        // A different file, since the same one again keeps its rules.
        sample = () => Promise.resolve(new Response(sampleCsv(150)));
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Search 150 products' }));
        expect(await screen.findByRole('button', { name: 'Keep my products' })).toHaveFocus();
        expect(screen.getByText(/Searching this file replaces your products/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Keep my products' }));
        await screen.findByText(/the 200 products you loaded/);
        expect(await rules.current()).toEqual(SAVED);
    });

    it('asks before saying the store is being built, and reads each answer with the question', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace(SAVED);
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        sample = () => Promise.resolve(new Response(sampleCsv(150)));
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        const headings: string[] = [];
        const watch = new MutationObserver(() => {
            for (const heading of document.querySelectorAll('h1')) {
                headings.push(heading.textContent);
            }
        });
        watch.observe(document.body, { childList: true, subtree: true, characterData: true });
        await userEvent.click(await screen.findByRole('button', { name: 'Search 150 products' }));
        const keep = await screen.findByRole('button', { name: 'Keep my products' });
        watch.disconnect();
        // The page never said it was building before it asked.
        expect(headings.some((heading) => heading.startsWith('Building the store'))).toBe(false);
        const question =
            'Searching this file replaces your products and discards the rules you saved for them. Search it anyway?';
        // Named by the question once, so it is read with the answer that takes focus, and not twice.
        const group = screen.getByRole('group', { name: question });
        expect(group).toContainElement(keep);
        expect(group).toContainElement(
            screen.getByRole('button', { name: 'Yes, search this file' })
        );
        expect(keep).not.toHaveAccessibleDescription();
    });

    it('keeps a file dropped while the rules are read, rather than searching the one before it', async () => {
        page();
        await chooser();
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File(['name,price\nBench,120\n'], 'first.csv')
        );
        await screen.findByRole('heading', { level: 1, name: 'What is in first.csv' });
        let release: () => void = () => undefined;
        failure = failWhen(
            'GET',
            `${BASE}rules`,
            () =>
                new Promise<Response>((resolve) => {
                    release = () => resolve(Response.json({ rules: [], edited: false }));
                })
        );
        await userEvent.click(screen.getByRole('button', { name: 'Search 1 product' }));
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', {
            value: { files: [new File(['name,price\nStool,40\nLamp,30\n'], 'second.csv')] },
        });
        act(() => {
            document.body.dispatchEvent(drop);
        });
        await screen.findByRole('heading', { level: 1, name: 'What is in second.csv' });
        await act(async () => {
            release();
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        // The first file is neither searched nor put back over the second.
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
            'What is in second.csv'
        );
        // The press the drop overtook ended without a stage of its own, and still lets the next go.
        failure = undefined;
        await userEvent.click(screen.getByRole('button', { name: 'Search 2 products' }));
        await screen.findByText(/the 2 products you loaded/);
    });

    it('keeps its alert in the page before a problem, so the problem is heard as it arrives', async () => {
        failure = failWhen('PUT', `${BASE}catalog`, () =>
            Promise.reject(new Error('the worker stopped'))
        );
        page();
        await chooser();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await screen.findByRole('button', { name: 'Search 200 products' });
        await waitFor(() => expect(screen.getByRole('alert')).toBeEmptyDOMElement());
        await userEvent.click(screen.getByRole('button', { name: 'Search 200 products' }));
        await alerted(/The store could not be reached/);
    });

    it('keeps the chooser’s status in the page while a file is read, so “Reading” is heard', async () => {
        page();
        await chooser();
        const status = screen.getByRole('status');
        expect(status).toBeEmptyDOMElement();
        const slowFile = new File(['x'], 'slow.csv', { type: 'text/csv' });
        Object.defineProperty(slowFile, 'arrayBuffer', {
            value: () => new Promise(() => undefined),
        });
        await userEvent.upload(screen.getByLabelText('Choose a file'), slowFile);
        await waitFor(() => expect(status).toHaveTextContent('Reading slow.csv.'));
        expect(status).toBeInTheDocument();
    });

    it('draws choosing a file and searching it as the same large button', async () => {
        page();
        await chooser();
        expect(screen.getByText('Choose a file').closest('label')).toHaveClass(
            'button',
            'button-primary',
            'button-large'
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        expect(await screen.findByRole('button', { name: 'Search 200 products' })).toHaveClass(
            'button',
            'button-primary',
            'button-large'
        );
    });

    it('says the products are gone, and how to search the new file, when there is nothing to keep', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace(SAVED);
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        sample = () => Promise.resolve(new Response(sampleCsv(150)));
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Search 150 products' }));
        // Gone from this browser since the question was asked, as when another tab removed them.
        failure = failWhen('GET', `${BASE}catalog`, () =>
            Promise.resolve(new Response('not found', { status: 404 }))
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Keep my products' }));
        await alerted(
            'Your products are no longer in this browser, so there is nothing to keep. Press “Yes, search this file” to search it.'
        );
        // The alert means the failed read is answered, so the failure can go. It goes before the
        // press, since the page reads the catalog back as soon as it is built, and on a loaded run
        // that read can come before the press returns and find the new products gone.
        failure = undefined;
        await userEvent.click(screen.getByRole('button', { name: 'Yes, search this file' }));
        await screen.findByText(/the 150 products you loaded/);
    });

    it('replaces the products and forgets their rules once the visitor says yes', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace(SAVED);
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        // A different file, since the same one again keeps its rules.
        sample = () => Promise.resolve(new Response(sampleCsv(150)));
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Search 150 products' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Yes, search this file' }));
        await screen.findByText(/the 150 products you loaded/);
        expect(await rules.current()).toBeUndefined();
    });

    it('asks nothing when the saved set is empty, since there is nothing to lose', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace([]);
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        expect(await chooser()).toBeInTheDocument();
    });

    it('asks before removing the products discards saved rules, and sends one removal for two presses', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace(SAVED);
        let removals = 0;
        failure = (request) => {
            if (request.method === 'DELETE' && request.url.includes('discard-rules=yes'))
                removals += 1;
            return undefined;
        };
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        expect(await screen.findByRole('button', { name: 'Keep my products' })).toHaveFocus();
        await userEvent.dblClick(screen.getByRole('button', { name: 'Yes, remove them' }));
        expect(await chooser()).toBeInTheDocument();
        expect(removals).toBe(1);
        expect(await rules.current()).toBeUndefined();
    });

    it('sends one removal when a second press lands just after the first is answered', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace(SAVED);
        let removals = 0;
        let answer: () => void = () => undefined;
        failure = (request) => {
            if (request.method !== 'DELETE' || !request.url.includes('discard-rules=yes')) {
                return undefined;
            }
            removals += 1;
            return new Promise((resolve) => {
                answer = () => resolve(new Response(null, { status: 204 }));
            });
        };
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        const yes = await screen.findByRole('button', { name: 'Yes, remove them' });
        await userEvent.click(yes);
        // The page clears the search once the removal is answered, the last step before it draws.
        const cleared = vi.spyOn(window.history, 'replaceState');
        await pressBetween(yes, answer, () => cleared.mock.calls.length > 0);
        cleared.mockRestore();
        expect(await chooser()).toBeInTheDocument();
        expect(removals).toBe(1);
    });

    it('reads the products once for a way back pressed again before they are drawn', async () => {
        const { worker } = page();
        await loadSample();
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        let reads = 0;
        let answer: () => void = () => undefined;
        failure = (request) => {
            if (request.method !== 'GET' || new URL(request.url).pathname !== `${BASE}catalog`) {
                return undefined;
            }
            reads += 1;
            return new Promise((resolve) => {
                answer = () =>
                    resolve(
                        worker.handle(request).then((response) => response ?? Response.error())
                    );
            });
        };
        const back = screen.getByRole('button', { name: 'Back to your products' });
        await userEvent.click(back);
        // The page puts the search back once the products are read, the last step before it draws.
        const restored = vi.spyOn(window.history, 'replaceState');
        await pressBetween(back, answer, () => restored.mock.calls.length > 0);
        restored.mockRestore();
        await screen.findByText(/the 200 products you loaded/);
        expect(reads).toBe(1);
    });

    it('asks once for a search pressed again before the question is drawn', async () => {
        const { rules, worker } = page();
        await loadSample();
        await rules.replace(SAVED);
        await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
        await chooser();
        sample = () => Promise.resolve(new Response(sampleCsv(150)));
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        const search = await screen.findByRole('button', { name: 'Search 150 products' });
        // The rules and the products are read before the question, and held until both are in.
        let asks = 0;
        let bodies = 0;
        const held: (() => void)[] = [];
        failure = (request) => {
            const path = new URL(request.url).pathname;
            if (
                request.method !== 'GET' ||
                (path !== `${BASE}rules` && path !== `${BASE}catalog`)
            ) {
                return undefined;
            }
            if (path === `${BASE}rules`) asks += 1;
            return new Promise((resolve) => {
                held.push(() =>
                    resolve(
                        worker.handle(request).then((answered) => {
                            const response = answered ?? Response.error();
                            const read = response.json.bind(response);
                            response.json = async () => {
                                const body: unknown = await read();
                                bodies += 1;
                                return body;
                            };
                            return response;
                        })
                    )
                );
            });
        };
        await userEvent.click(search);
        await waitFor(() => expect(held).toHaveLength(2));
        // Once both bodies are read, the rest of the check needs nothing more from the worker.
        await pressBetween(
            search,
            () => held.splice(0).forEach((release) => release()),
            () => bodies === 2
        );
        expect(await screen.findByRole('button', { name: 'Keep my products' })).toBeInTheDocument();
        expect(asks).toBe(1);
    });

    it('puts focus back on the remove button when the visitor keeps their rules, or the removal fails', async () => {
        const { rules } = page();
        await loadSample();
        await rules.replace(SAVED);
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Keep my products' }));
        expect(screen.getByRole('button', { name: 'Remove your products' })).toHaveFocus();
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        const yes = await screen.findByRole('button', { name: 'Yes, remove them' });
        failure = failWhen('DELETE', `${BASE}catalog`, () =>
            Promise.resolve(new Response(null, { status: 500 }))
        );
        await userEvent.click(yes);
        await screen.findByRole('alert');
        expect(screen.getByRole('button', { name: 'Remove your products' })).toHaveFocus();
    });

    it('shows the file it read last, whichever finishes first', async () => {
        page();
        await chooser();
        let finishSlow: (text: string) => void = (_text) => undefined;
        const slow = new Promise<string>((resolve) => {
            finishSlow = resolve;
        });
        const input = screen.getByLabelText('Choose a file');
        const slowFile = new File(['x'], 'slow.csv', { type: 'text/csv' });
        // The page reads a chosen file's bytes, so they are what arrives late.
        Object.defineProperty(slowFile, 'arrayBuffer', {
            value: () => slow.then((text) => new TextEncoder().encode(text).buffer),
        });
        await userEvent.upload(input, slowFile);
        expect(await screen.findByRole('status')).toHaveTextContent('Reading slow.csv.');
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File(['name,price\nBoot,$10.00\n'], 'quick.csv', { type: 'text/csv' })
        );
        await screen.findByRole('heading', { level: 1, name: 'What is in quick.csv' });
        await act(async () => {
            finishSlow('name,price\nHat,$5.00\n');
            await slow;
        });
        expect(
            screen.getByRole('heading', { level: 1, name: 'What is in quick.csv' })
        ).toBeInTheDocument();
    });

    it('names a file just past the size limit as larger than the limit', async () => {
        page();
        await chooser();
        const big = new File(['x'], 'big.csv');
        Object.defineProperty(big, 'size', { value: CATALOG_FILE_BYTES_CAP + 4096 });
        await userEvent.upload(screen.getByLabelText('Choose a file'), big);
        await alerted(
            'This file is 40.1 MB, and the largest this page reads is 40 MB. Choose a smaller file, or delete rows from this one.'
        );
        await waitFor(() => expect(screen.getByLabelText('Choose a file')).toBeInTheDocument());
    });

    it('keeps focus on the choice being changed after a search that failed', async () => {
        failure = failWhen('PUT', `${BASE}catalog`, () =>
            Promise.reject(new Error('the worker stopped'))
        );
        page();
        await chooser();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Search 200 products' }));
        await screen.findByRole('alert');
        const price = screen.getByLabelText('Price');
        await userEvent.selectOptions(price, 'Member price');
        expect(price).toHaveFocus();
    });

    /** A file of 1,500 rows whose second price column does not read on row 1,300, past the first rows. */
    const large = () => {
        const rows = Array.from(
            { length: 1500 },
            (_, index) => `Item ${index},$1.00,${index === 1298 ? 'free' : '$2.00'},R${index}`
        ).join('\n');
        return new File([`name,price,other,ref\n${rows}\n`], 'large.csv');
    };

    it('shows a large file’s first rows at once after a change, and the whole of it after a pause', async () => {
        page();
        await chooser();
        await userEvent.upload(screen.getByLabelText('Choose a file'), large());
        await screen.findByRole('button', { name: 'Search 1,500 products' });
        await userEvent.selectOptions(screen.getByLabelText('Price'), 'other');
        expect(screen.getByRole('button', { name: 'Search these products' })).toBeInTheDocument();
        expect(screen.getByText('Checking all 1,500 rows.')).toBeInTheDocument();
        // Made again whole with the new mapping, so the row whose new price does not read is left out.
        expect(
            await screen.findByRole('button', { name: 'Search 1,499 products' })
        ).toBeInTheDocument();
        expect(screen.getByText('1 row is left out')).toBeInTheDocument();
    });

    it('searches every row when Search is pressed before the whole file is checked', async () => {
        page();
        await chooser();
        await userEvent.upload(screen.getByLabelText('Choose a file'), large());
        await screen.findByRole('button', { name: 'Search 1,500 products' });
        await userEvent.selectOptions(screen.getByLabelText('Price'), 'other');
        await userEvent.click(screen.getByRole('button', { name: 'Search these products' }));
        // All of it, with the new mapping, not the first rows the preview was made from.
        await screen.findByText(/the 1,499 products you loaded/);
    });

    it('refuses an ID repeated past the first rows, chosen after the guess, before anything is sent', async () => {
        page();
        await chooser();
        const rows = Array.from(
            { length: 1500 },
            (_, index) => `Item ${index},$1.00,${index === 1398 ? 'R5' : `R${index}`}`
        ).join('\n');
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File([`name,price,ref\n${rows}\n`], 'repeats.csv')
        );
        await screen.findByRole('button', { name: 'Search 1,500 products' });
        let sent = 0;
        failure = (request) => {
            if (request.method === 'PUT') sent += 1;
            return undefined;
        };
        await userEvent.selectOptions(screen.getByLabelText('Product ID'), 'ref');
        await userEvent.click(screen.getByRole('button', { name: 'Search these products' }));
        await alerted('The ID “R5” is on row 7 and row 1400, and each product needs its own.');
        expect(sent).toBe(0);
    });
});

describe('while the store is built', () => {
    it('keeps focus on a heading that says so, then hands it to the results', async () => {
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        // The worker's answer waits, so the page can be read while the store is built.
        failure = (request) => {
            if (request.method !== 'PUT' || !new URL(request.url).pathname.endsWith('catalog')) {
                return undefined;
            }
            failure = undefined;
            return held.then(async () =>
                fetch(request.url, {
                    method: request.method,
                    headers: request.headers,
                    body: await request.text(),
                })
            );
        };
        page();
        await chooser();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Search 200 products' }));
        const building = await screen.findByRole('heading', {
            level: 1,
            name: 'Building the store from your 200 products',
        });
        await waitFor(() => expect(building).toHaveFocus());
        release();
        await screen.findByText(/the 200 products you loaded/);
        await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    });
});

describe('a store that does not start', () => {
    it('offers to try again when it did not start this time', async () => {
        render(
            <TryPage
                ready={Promise.reject(new StoreDidNotStart('the store took too long'))}
                base={BASE}
            />
        );
        const alert = await screen.findByRole('alert');
        expect(
            within(alert).getByRole('heading', { level: 1, name: 'The store could not start' })
        ).toBeInTheDocument();
        expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
        expect(alert).not.toHaveTextContent(/non-private/);
    });

    it('says to open a regular window in a browser that cannot run it', async () => {
        render(<TryPage ready={Promise.reject(new WorkerUnsupported('refused'))} base={BASE} />);
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Open this page in a regular, non-private window.');
        expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
    });
});
