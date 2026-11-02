import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App, REVEAL_WITHIN_MS } from './App.jsx';
import {
    CategoriesDocument,
    ProductDocument,
    SearchDocument,
    StoreDocument,
} from './generated/operations.js';
import { featured, open, shopAs } from './test/store.jsx';
import { StoreDidNotStart, WorkerUnsupported } from './worker/register.js';

/* How the store starts, what it says when something does not load or it cannot start, and whose demo it is. */

describe('a store that starts', () => {
    it('arrives in one step, the masthead, the content and the footer together', async () => {
        let start: () => void = () => undefined;
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={new Promise<void>((resolve) => (start = resolve))}
            />
        );
        expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
        act(() => start());
        await screen.findByRole('heading', { level: 1 });
        expect(screen.getByRole('combobox', { name: 'Search the store' })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Categories' })).toBeInTheDocument();
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('waits for the store to say what it holds, so the viewer switch arrives with the masthead', async () => {
        const STORE_OP = String(StoreDocument.__meta__?.['hash']);
        const answer = globalThis.fetch;
        let release = () => undefined as void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            if (new Request(input, init).url.includes(`op=${STORE_OP}`)) await held;
            return answer(input, init);
        });
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={Promise.resolve()}
            />
        );
        // The categories answer, and still the page waits for the store's own facts.
        await screen
            .findByText('Preparing the store.', undefined, { timeout: 2000 })
            .catch(() => undefined);
        expect(screen.queryByRole('combobox', { name: 'Search the store' })).toBeNull();
        release();
        expect(await screen.findByRole('combobox', { name: 'Shopping as' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Search the store' })).toBeInTheDocument();
    });

    it('shows the store without its categories when they do not answer', async () => {
        const CATEGORIES_OP = String(CategoriesDocument.__meta__?.['hash']);
        const answer = globalThis.fetch;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
            new Request(input, init).url.includes(`op=${CATEGORIES_OP}`)
                ? new Promise<Response>(() => undefined)
                : answer(input, init)
        );
        // The wait for the categories is the store's own clock, so the test moves it.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
            render(
                <App
                    apiUrl="http://store.test/graphql"
                    eventsUrl="http://store.test/events"
                    rulesUrl="http://store.test/rules"
                    ready={Promise.resolve()}
                />
            );
            // Moved a step at a time, so the store's own answer, which is not on the
            // clock, lands between steps, and the moment the page shows is known.
            const search = () => screen.queryByRole('combobox', { name: 'Search the store' });
            let moved = 0;
            while (!search() && moved < REVEAL_WITHIN_MS * 2) {
                await act(() => vi.advanceTimersByTimeAsync(50));
                moved += 50;
            }
            expect(search()).toBeInTheDocument();
            // Shown once the second was up, and within a step of it, so it was that wait.
            expect(moved).toBeGreaterThanOrEqual(REVEAL_WITHIN_MS);
            expect(moved).toBeLessThanOrEqual(REVEAL_WITHIN_MS + 50);
        } finally {
            vi.useRealTimers();
        }
        expect(screen.queryByRole('navigation', { name: 'Categories' })).not.toBeInTheDocument();
    });

    it('stays shown when its categories failed and the viewer changes', async () => {
        const CATEGORIES_OP = String(CategoriesDocument.__meta__?.['hash']);
        const answer = globalThis.fetch;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
            new Request(input, init).url.includes(`op=${CATEGORIES_OP}`)
                ? Promise.resolve(new Response('unavailable', { status: 503 }))
                : answer(input, init)
        );
        const user = await open();
        const box = screen.getByRole('combobox', { name: 'Search the store' });
        await shopAs(user, 'member');
        // The same box, never taken down while the new viewer's categories were asked for.
        expect(screen.getByRole('combobox', { name: 'Search the store' })).toBe(box);
    });

    it('shows a store that already answers at once', () => {
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready="started"
            />
        );
        expect(screen.getByRole('combobox', { name: 'Search the store' })).toBeInTheDocument();
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });
});

describe('what did not load', () => {
    /** Fails the first request for an operation, then answers as usual. */
    const failOnce = (operation: { readonly __meta__?: Record<string, unknown> | undefined }) => {
        const op = `op=${String(operation.__meta__?.['hash'])}`;
        const answer = globalThis.fetch;
        let failed = false;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            if (!failed && new Request(input, init).url.includes(op)) {
                failed = true;
                return Promise.resolve(new Response('unavailable', { status: 503 }));
            }
            return answer(input, init);
        });
    };

    it('keeps focus on the page while a product is asked for again', async () => {
        const op = `op=${String(ProductDocument.__meta__?.['hash'])}`;
        const served = globalThis.fetch;
        let asked = 0;
        let release = () => undefined as void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            if (new Request(input, init).url.includes(op)) {
                asked += 1;
                if (asked === 1) return new Response('unavailable', { status: 503 });
                await held;
            }
            return served(input, init);
        });
        await openProduct();
        await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }));
        // Try again has gone, so focus is on the loading view rather than the body.
        await waitFor(() =>
            expect(screen.getByRole('region', { name: 'Loading the product.' })).toHaveFocus()
        );
        release();
        await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    });

    it('says the products could not be loaded, and loads them on Try again', async () => {
        failOnce(SearchDocument);
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={Promise.resolve()}
            />
        );
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(
            'The products could not be loaded. Try again, and if it keeps happening, reload the page.'
        );
        await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
        // The button went with the message, so the results heading takes focus.
        await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('All products');
    });

    const openProduct = () => {
        window.history.replaceState(null, '', `/?product=${featured.sku}`);
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={Promise.resolve()}
            />
        );
        return screen.findByText(/This product could not be loaded\./);
    };

    it('says a product could not be loaded, and loads it on Try again', async () => {
        failOnce(ProductDocument);
        const message = await openProduct();
        // Focus moves to the message, which reads it, so it is not announced as well.
        expect(message).not.toHaveAttribute('role', 'alert');
        expect(message.closest('section')).toHaveFocus();
        await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(featured.name);
        expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    });

    it('leaves a product that did not load for the store', async () => {
        failOnce(ProductDocument);
        await openProduct();
        // The visit began on the product, so the way out is named for the store.
        await userEvent.setup().click(screen.getByRole('button', { name: 'Browse all products' }));
        expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('All products');
    });
});

describe('a store that does not start', () => {
    const startWith = (ready: Promise<void>, retry = vi.fn()) => {
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={ready}
                retry={retry}
            />
        );
        return retry;
    };

    it('offers to try again when the store did not start this time', async () => {
        const retry = startWith(Promise.reject(new StoreDidNotStart('the store took too long')));
        const alert = await screen.findByRole('alert');
        expect(
            within(alert).getByRole('heading', { level: 1, name: 'The store could not start' })
        ).toBeInTheDocument();
        expect(alert).toHaveTextContent('Check your connection and try again.');
        await userEvent.setup().click(within(alert).getByRole('button', { name: 'Try again' }));
        expect(retry).toHaveBeenCalledOnce();
        expect(screen.queryByText('Preparing the store.')).not.toBeInTheDocument();
    });

    it('keeps the masthead\u2019s room only while the store is on its way', async () => {
        let fail = (_error: Error) => undefined as void;
        startWith(
            new Promise<void>((_resolve, reject) => {
                fail = reject;
            })
        );
        const masthead = () => document.querySelector('.masthead');
        expect(masthead()).toHaveClass('is-waiting');
        fail(new StoreDidNotStart('the store took too long'));
        await screen.findByRole('alert');
        // The search box will never come, so the room for it goes.
        expect(masthead()).not.toHaveClass('is-waiting');
    });

    it('keeps no room on a page whose masthead is not the store\u2019s own', () => {
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={new Promise<void>(() => undefined)}
                tour={false}
            />
        );
        expect(document.querySelector('.masthead')).not.toHaveClass('is-waiting');
    });

    it('says what to do instead in a browser that cannot run it, with nothing to retry', async () => {
        startWith(Promise.reject(new WorkerUnsupported('no service worker')));
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Open this page in a regular, non-private window.');
        expect(alert).not.toHaveTextContent(/service worker/i);
        expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
    });
});

describe('whose demo this is', () => {
    it('says so above the masthead and below the content, with the portfolio and the source', async () => {
        await open();
        const strip = screen.getByRole('navigation', { name: 'Portfolio' });
        expect(within(strip).getByRole('link', { name: 'A demo by Jason Poteet' })).toHaveAttribute(
            'href',
            'https://jasonsdevspace.com/#work'
        );
        expect(within(strip).getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
            'href',
            'https://github.com/jasonsdevspace/shelflens'
        );
        // The strip comes first in reading order, so it is the first thing a screen reader hears.
        expect(strip.compareDocumentPosition(screen.getByRole('banner'))).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
        );
        // No new tab: the way back is the way the visitor came.
        for (const link of within(strip).getAllByRole('link')) {
            expect(link).not.toHaveAttribute('target');
        }

        const footer = screen.getByRole('contentinfo');
        expect(within(footer).getByRole('link', { name: 'Jason Poteet' })).toHaveAttribute(
            'href',
            'https://jasonsdevspace.com/'
        );
        expect(within(footer).getByRole('link', { name: 'more work' })).toHaveAttribute(
            'href',
            'https://github.com/jasonsdevspace'
        );
        expect(within(footer).getByRole('link', { name: 'MIT license' })).toHaveAttribute(
            'href',
            expect.stringContaining('/LICENSE')
        );
    });
});
