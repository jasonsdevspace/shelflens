import type { Rule } from '@jasonsdevspace/shelflens';
import {
    createMemoryEventStore,
    createMemoryRuleStore,
    PERSISTED_OPERATIONS,
} from '@shelflens/api';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryCatalogStore } from '../worker/catalog-db.js';
import { createWorkerApi } from '../worker/handle.js';
import { StoreDidNotStart, WorkerUnsupported } from '../worker/register.js';
import { CATALOG_FILE_BYTES_CAP } from './limits.js';
import { SAMPLE_FILE, sampleCsv } from './sample.js';
import { TryPage } from './TryPage.jsx';

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
    return { rules };
};

/** One saved rule, as the panel would save it. Only whether it exists matters here. */
const SAVED: Rule[] = [{ id: 'pin', pin: ['SL-00001'] }];

const failWhen =
    (method: string, path: string, answer: () => Promise<Response>): Failure =>
    (request) =>
        request.method === method && new URL(request.url).pathname === path ? answer() : undefined;

const chooser = () => screen.findByRole('heading', { level: 1, name: 'Search your own products' });

const loadSample = async () => {
    await chooser();
    await userEvent.click(
        screen.getByRole('button', { name: 'Try it with a sample of 200 products' })
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Search 200 products' }));
    await screen.findByText(/your own catalog of 200 products/);
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
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The sample could not be loaded (error 404)'
        );
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
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The store could not be reached (the worker stopped). Press "Search 200 products" to try again.'
        );
        failure = undefined;
        await userEvent.click(screen.getByRole('button', { name: 'Search 200 products' }));
        await screen.findByText(/your own catalog of 200 products/);
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
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The store could not use these products, since the catalog has no products.'
        );
    });

    it('keeps the products, and says so, when removing them fails', async () => {
        page();
        await loadSample();
        failure = failWhen('DELETE', `${BASE}catalog`, () =>
            Promise.resolve(new Response(null, { status: 500 }))
        );
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Your products could not be removed (error 500), so they are still here.'
        );
        expect(screen.getByText(/your own catalog of 200 products/)).toBeInTheDocument();
    });

    it('removes the products and is back where a file is chosen', async () => {
        page();
        await loadSample();
        await userEvent.click(screen.getByRole('button', { name: 'Remove your products' }));
        expect(await chooser()).toBeInTheDocument();
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
        await screen.findByText(/your own catalog of 200 products/);
        expect(await rules.current()).toEqual(SAVED);
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
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Your products are no longer in this browser, so there is nothing to keep. Press "Yes, search this file" to search it.'
        );
        await userEvent.click(screen.getByRole('button', { name: 'Yes, search this file' }));
        failure = undefined;
        await screen.findByText(/your own catalog of 150 products/);
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
        await screen.findByText(/your own catalog of 150 products/);
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
        let finishSlow!: (text: string) => void;
        const slow = new Promise<string>((resolve) => {
            finishSlow = resolve;
        });
        const input = screen.getByLabelText('Choose a file');
        const slowFile = new File(['x'], 'slow.csv', { type: 'text/csv' });
        Object.defineProperty(slowFile, 'text', { value: () => slow });
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
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'This file is 40.1 MB, and the largest this page reads is 40.0 MB.'
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

    it('shows a large file’s first rows at once after a change, and the whole of it after a pause', async () => {
        page();
        await chooser();
        const rows = Array.from({ length: 1500 }, (_, index) => `Item ${index},$1.00,$2.00`).join(
            '\n'
        );
        await userEvent.upload(
            screen.getByLabelText('Choose a file'),
            new File([`name,price,other\n${rows}\n`], 'large.csv')
        );
        await screen.findByRole('button', { name: 'Search 1,500 products' });
        await userEvent.selectOptions(screen.getByLabelText('Price'), 'other');
        expect(screen.getByRole('button', { name: 'Search these products' })).toBeInTheDocument();
        expect(screen.getByText('Checking all 1,500 rows.')).toBeInTheDocument();
        expect(
            await screen.findByRole('button', { name: 'Search 1,500 products' })
        ).toBeInTheDocument();
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
        await screen.findByText(/your own catalog of 200 products/);
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
