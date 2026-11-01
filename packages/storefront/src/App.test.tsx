import { createMemoryEventStore, createMemoryRuleStore } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App, REVEAL_WITHIN_MS } from './App.jsx';
import { CategoriesDocument, ProductDocument, SearchDocument } from './generated/operations.js';
import { createWorkerApi } from './worker/handle.js';
import { StoreDidNotStart, WorkerUnsupported } from './worker/register.js';
import { serving } from './worker/serving.js';

/*
 * The storefront end to end, in a document, over the real API.
 *
 * Nothing is mocked but the network: fetch is routed to the same worker
 * handler the service worker runs, over a generated catalog. So the facet
 * counts, the sort fallbacks and the pages are the real ones, and a test
 * here fails when the API and the page disagree.
 */

const catalog = generateCatalog({ seed: 42, products: 300 });
const jackets = catalog.products.filter((p) => /jacket/i.test(p.name));
const featured = jackets[jackets.length - 1];
if (!featured) throw new Error('expected a jacket in the catalog');
/** One rule, so explain mode has a pin to show and a price sort has something to set aside. */
const rules = [{ id: 'featured-jacket', when: { queries: ['jacket'] }, pin: [featured.sku] }];

let events = createMemoryEventStore();
let savedRules = createMemoryRuleStore();

beforeAll(() => {
    const worker = createWorkerApi({
        catalogUrl: 'catalog.json',
        rulesUrl: 'rules.json',
        fetch: serving(catalog, { rules }),
        // The same store the API reads, replaced before each test, so no test
        // sees what another viewed.
        events: {
            append: (batch) => events.append(batch),
            all: () => events.all(),
        },
        rules: {
            current: () => savedRules.current(),
            replace: (rules) => savedRules.replace(rules),
            reset: () => savedRules.reset(),
        },
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await worker.handle(new Request(input, init));
        return response ?? new Response('not found', { status: 404 });
    });
});

beforeEach(() => {
    events = createMemoryEventStore();
    savedRules = createMemoryRuleStore();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    // The tour opens itself on a first visit. These tests are not that visit.
    localStorage.setItem('shelflens.tour', 'seen');
});

afterEach(() => {
    vi.restoreAllMocks();
});

const open = async (search = '') => {
    window.history.replaceState(null, '', `/${search}`);
    render(
        <App
            apiUrl="http://store.test/graphql"
            eventsUrl="http://store.test/events"
            rulesUrl="http://store.test/rules"
            ready={Promise.resolve()}
        />
    );
    await screen.findByRole('heading', { level: 1 });
    return userEvent.setup();
};

const heading = () => screen.getByRole('heading', { level: 1 });
const cards = () => within(screen.getByRole('list', { name: 'Products' })).getAllByRole('link');
const facet = (title: string) => screen.getByRole('group', { name: title });
const amount = (text: string | null | undefined) =>
    Number(/\d+(?:\.\d+)?/.exec((text ?? '').replace(/,/g, ''))?.[0]);
const shownPrice = () => amount(document.querySelector('.product-price')?.textContent);
const shopAs = (user: ReturnType<typeof userEvent.setup>, group: 'guest' | 'member') =>
    user.selectOptions(screen.getByRole('combobox', { name: 'Shopping as' }), group);

const settled = () =>
    waitFor(() =>
        expect(document.querySelector('.results-layout')).not.toHaveAttribute('aria-busy', 'true')
    );

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

    it('shows the store without its categories when they do not answer', async () => {
        const CATEGORIES_OP = String(CategoriesDocument.__meta__?.['hash']);
        const answer = globalThis.fetch;
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
            new Request(input, init).url.includes(`op=${CATEGORIES_OP}`)
                ? new Promise<Response>(() => undefined)
                : answer(input, init)
        );
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={Promise.resolve()}
            />
        );
        expect(
            await screen.findByRole(
                'combobox',
                { name: 'Search the store' },
                { timeout: REVEAL_WITHIN_MS + 1000 }
            )
        ).toBeInTheDocument();
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

describe('keeping place', () => {
    it('keeps a ticked filter in its group, checked, when nothing else in the group matches', async () => {
        await open('?color=Nowhere');
        const nowhere = within(facet('Color')).getByRole('checkbox', { name: /Nowhere/ });
        expect(nowhere).toBeChecked();
        // The answer gave it no count, so none is made up.
        expect(nowhere.parentElement?.querySelector('.facet-count')).toBeNull();
    });

    it('moves focus to the new page heading after Next, and says the page', async () => {
        const user = await open();
        await user.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() => expect(heading()).toHaveFocus());
        await waitFor(() =>
            expect(
                screen
                    .getAllByRole('status')
                    .some((status) => /page 2 of \d+/.test(status.textContent))
            ).toBe(true)
        );
    });

    it('leaves focus alone after a click that never took it, as Safari does', async () => {
        await open();
        const box = within(facet('Brand')).getAllByRole('checkbox')[0];
        if (!box) throw new Error('expected a brand');
        // A click with no focus, as Safari gives a checkbox.
        fireEvent.click(box);
        await waitFor(() => expect(window.location.search).toContain('brand='));
        await settled();
        expect(document.activeElement).toBe(document.body);
    });

    it("keeps focus on the current page's number when it is pressed again", async () => {
        const user = await open();
        const current = screen.getByRole('button', { name: 'Page 1' });
        await user.click(current);
        expect(current).toHaveFocus();
    });

    it('skips the filter column to the results heading, leaving the address alone', async () => {
        const user = await open('?q=jacket');
        const before = window.location.href;
        await user.click(screen.getByRole('link', { name: 'Skip to results' }));
        expect(heading()).toHaveFocus();
        expect(window.location.href).toBe(before);
    });

    it('keeps the explain switch on a page with nothing found while explain mode is on', async () => {
        await open('?q=jacket&price=0-1&explain=1');
        await settled();
        expect(screen.getByRole('button', { name: 'Explain ranking' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        expect(screen.queryByRole('combobox', { name: 'Sort by' })).toBeNull();
    });

    it('says when a page is past the last, and links to the last page', async () => {
        const user = await open('?page=999');
        const link = await screen.findByRole('link', { name: /Go to page \d+/ });
        expect(screen.getByText(/Page 999 is past the last page of results/)).toBeInTheDocument();
        await user.click(link);
        await waitFor(() => expect(cards().length).toBeGreaterThan(0));
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

    it('says what to do instead in a browser that cannot run it, with nothing to retry', async () => {
        startWith(Promise.reject(new WorkerUnsupported('no service worker')));
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Open this page in a regular, non-private window.');
        expect(alert).not.toHaveTextContent(/service worker/i);
        expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
    });
});

describe('browsing', () => {
    it('shows every product in catalog order with the facets beside them', async () => {
        await open();
        expect(heading()).toHaveTextContent(/^All products, \d+ products$/);
        expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('catalog');
        expect(cards()).toHaveLength(24);
        for (const title of ['Category', 'Brand', 'Color', 'Size', 'Price', 'Rating']) {
            expect(facet(title)).toBeInTheDocument();
        }
        const audit = await axe.run(document.body, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(audit.violations).toEqual([]);
    });

    it('steps into a category from the navigation, sorted by position, with a breadcrumb', async () => {
        const user = await open();
        const root = catalog.categories.find((category) => category.path.length === 1);
        if (!root) throw new Error('expected a root category');
        await user.click(
            within(screen.getByRole('navigation', { name: 'Categories' })).getByRole('link', {
                name: root.name,
            })
        );
        await settled();
        expect(window.location.search).toBe(`?category=${root.id}`);
        // The category says how many products it holds, on the page and to a screen reader.
        expect(heading()).toHaveTextContent(new RegExp(`^${root.name}, \\d+ products$`));
        await waitFor(() =>
            expect(
                screen
                    .getAllByRole('status')
                    .some((status) => status.textContent.startsWith(heading().textContent))
            ).toBe(true)
        );
        expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('position');
        const crumbs = screen.getByRole('navigation', { name: 'Category' });
        expect(within(crumbs).getByRole('link', { name: root.name })).toHaveAttribute(
            'aria-current',
            'page'
        );
        // The category facet now offers this category's children, not the roots.
        const child = catalog.categories.find(
            (category) => category.path[0] === root.id && category.path.length === 2
        );
        if (!child) throw new Error('expected a child category');
        expect(
            within(facet('Category')).getByRole('button', {
                name: new RegExp(`^${child.name}, \\d+ results?$`),
            })
        ).toBeInTheDocument();
    });
});

describe('narrowing', () => {
    it('shows six of a long list, with the rest a click away and a ticked one never hidden', async () => {
        const user = await open();
        const brands = () => within(facet('Brand')).getAllByRole('checkbox');
        expect(brands()).toHaveLength(6);
        const more = within(facet('Brand')).getByRole('button', { name: /Show all \d+ brands/ });
        expect(more).toHaveAttribute('aria-expanded', 'false');
        await user.click(more);
        expect(brands().length).toBeGreaterThan(6);
        const last = brands().at(-1);
        if (!last) throw new Error('expected a brand');
        await user.click(last);
        await settled();
        await user.click(within(facet('Brand')).getByRole('button', { name: 'Show fewer brands' }));
        expect(brands()).toHaveLength(7);
        const kept = brands().at(-1);
        if (!kept) throw new Error('expected the ticked brand');
        expect(kept).toBeChecked();
        // Unticking it leaves it in place, under the same focus, until the list is folded again.
        await user.click(kept);
        await settled();
        expect(brands()).toHaveLength(7);
        expect(brands().at(-1)).not.toBeChecked();
        expect(within(facet('Brand')).getByRole('button', { name: /Show all/ })).toHaveAttribute(
            'aria-controls',
            facet('Brand').id
        );
    });

    it('filters by a brand and keeps counting the other brands', async () => {
        const user = await open();
        const boxes = within(facet('Brand')).getAllByRole('checkbox');
        const [first] = boxes;
        if (!first) throw new Error('expected a brand');
        const brand = first.getAttribute('value') ?? '';
        const countsBefore = boxes.map((box) => box.parentElement?.textContent);

        await user.click(first);
        await settled();

        expect(new URLSearchParams(window.location.search).getAll('brand')).toEqual([brand]);
        expect(first).toBeChecked();
        for (const card of cards()) expect(card).toHaveTextContent(brand);
        // Disjunctive counts: every other brand still has a count, the same as before.
        const countsAfter = within(facet('Brand'))
            .getAllByRole('checkbox')
            .map((box) => box.parentElement?.textContent);
        expect(countsAfter).toEqual(countsBefore);
    });

    it('narrows to a price band and a rating, and clears both at once', async () => {
        const user = await open();
        await user.click(within(facet('Price')).getByRole('radio', { name: /Under/ }));
        await settled();
        expect(window.location.search).toBe('?price=-50');
        for (const card of cards()) expect(card.textContent).toMatch(/\$\d+/);

        await user.click(
            within(facet('Rating')).getByRole('radio', { name: /^4 stars and up, \d+ results?$/ })
        );
        await settled();
        expect(window.location.search).toBe('?price=-50&rating=4');

        await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
        await settled();
        expect(window.location.search).toBe('');
        // The button goes with the filters, and focus moves to the results heading.
        expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
        await waitFor(() => expect(heading()).toHaveFocus());
    });

    it('sorts by price from the toolbar', async () => {
        const user = await open();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-asc');
        await settled();
        expect(window.location.search).toBe('?sort=price-asc');
        const prices = cards().map((card) =>
            Number(card.querySelector('.card-price')?.textContent.match(/\$(\d+)/)?.[1])
        );
        expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    it('undoes a filter with the back button', async () => {
        const user = await open();
        await user.click(within(facet('Color')).getAllByRole('checkbox')[0] as HTMLElement);
        await settled();
        expect(window.location.search).toMatch(/^\?color=/);

        await act(async () => {
            window.history.back();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await settled();
        expect(window.location.search).toBe('');
        expect(within(facet('Color')).getAllByRole('checkbox')[0]).not.toBeChecked();
    });
});

describe('counting', () => {
    it('says one result in the singular, in the heading and the status', async () => {
        const user = await open('?q=jacket');
        await settled();
        // A filter that leaves one result, read from the counts beside the filters.
        const [one] = within(screen.getByRole('form', { name: 'Narrow the results' }))
            .getAllByRole('checkbox')
            .filter((box) => /, 1 result$/.test(box.closest('label')?.textContent ?? ''));
        if (!one) throw new Error('expected a filter with one result');
        await user.click(one);
        await settled();
        expect(heading()).toHaveTextContent(/^1 result for "jacket"$/);
        await waitFor(() =>
            expect(
                screen
                    .getAllByRole('status')
                    .some((status) => status.textContent === '1 result for "jacket"')
            ).toBe(true)
        );
    });
});

describe('paging', () => {
    it('moves to the next page and never repeats a product', async () => {
        const user = await open();
        const firstPage = cards().map((card) => card.getAttribute('href'));
        expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Next' }));
        await settled();
        expect(window.location.search).toBe('?page=2');
        expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
            'aria-current',
            'page'
        );
        const secondPage = cards().map((card) => card.getAttribute('href'));
        expect(secondPage.some((href) => firstPage.includes(href))).toBe(false);
    });

    it('returns to the first page when a filter changes', async () => {
        const user = await open('?page=2');
        await user.click(within(facet('Brand')).getAllByRole('checkbox')[0] as HTMLElement);
        await settled();
        expect(window.location.search).not.toContain('page=');
    });
});

describe('searching and looking', () => {
    it('submits a phrase from the search box into the URL and the heading', async () => {
        const user = await open();
        await user.type(screen.getByRole('combobox', { name: 'Search the store' }), 'boot{Enter}');
        await waitFor(() => expect(window.location.search).toBe('?q=boot'));
        await settled();
        expect(heading()).toHaveTextContent(/results for "boot"/);
        expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('relevance');
    });

    it('opens a product over the results and comes back to them', async () => {
        const brand = catalog.products[0]?.brand ?? '';
        const user = await open(`?${new URLSearchParams({ brand })}`);
        const [first] = cards();
        if (!first) throw new Error('expected a product');
        const name = first.querySelector('.card-name')?.textContent ?? '';
        await user.click(first);
        await screen.findByRole('heading', { level: 1, name });
        expect(window.location.search).toContain('product=');
        expect(screen.getByRole('table')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Back to results' }));
        await settled();
        expect(window.location.search).not.toContain('product=');
        expect(
            within(facet('Brand')).getByRole('checkbox', { name: new RegExp(brand) })
        ).toBeChecked();
    });
});

describe('keeping its place', () => {
    const announced = () =>
        screen
            .getAllByRole('status')
            .map((region) => region.textContent)
            .join('|');

    it('announces the results once they land, after a search and after a filter', async () => {
        const user = await open('?q=jacket');
        await settled();
        await waitFor(() => expect(announced()).toContain(heading().textContent));
        const [brand] = within(facet('Brand')).getAllByRole('checkbox');
        if (!brand) throw new Error('expected a brand');
        await user.click(brand);
        await settled();
        await waitFor(() => expect(announced()).toContain(heading().textContent));
    });

    it('keeps focus in the search box after Enter, and says nothing about suggestions', async () => {
        const user = await open();
        const box = screen.getByRole('combobox', { name: 'Search the store' });
        await user.type(box, 'jacket{Enter}');
        await settled();
        expect(heading()).toHaveTextContent('results for "jacket"');
        expect(box).toHaveFocus();
        expect(box).toHaveValue('jacket');
        expect(document.querySelector('.searchbox-status')?.textContent).toBe('');
    });

    it('says a product is on its way, with the way back beside it, while it loads', async () => {
        const op = `op=${String(ProductDocument.__meta__?.['hash'])}`;
        const served = globalThis.fetch;
        let release = () => undefined as void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            if (new Request(input, init).url.includes(op)) await held;
            return served(input, init);
        });
        const user = await open();
        const [first] = cards();
        if (!first) throw new Error('expected a product');
        await user.click(first);
        // The view is named by its line, so focus landing on it says it once.
        const loading = await screen.findByRole('region', { name: 'Loading the product.' });
        expect(screen.queryByRole('status', { name: 'Loading the product.' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Back to results' })).toBeVisible();
        await waitFor(() => expect(loading).toHaveFocus());
        release();
        await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    });

    it('names the way out for the results beneath a product, a sort included', async () => {
        const seen = catalog.products.find((p) => p.visibleTo.length === 2);
        if (!seen) throw new Error('expected a product every viewer may see');
        await open(`?sort=price-asc&product=${seen.sku}`);
        await screen.findByRole('heading', { level: 1, name: seen.name });
        expect(screen.getByRole('button', { name: 'Back to results' })).toBeInTheDocument();
    });

    it('names the browser tab for the product, and gives the name back on close', async () => {
        document.title = 'ShelfLens';
        const user = await open();
        const [first] = cards();
        if (!first) throw new Error('expected a product');
        const name = first.querySelector('.card-name')?.textContent ?? '';
        await user.click(first);
        await screen.findByRole('heading', { level: 1, name });
        expect(document.title).toBe(`${name}, ShelfLens`);
        // The browser leaves the scroll to the page while a product is open.
        expect(window.history.scrollRestoration).toBe('manual');
        await user.click(screen.getByRole('button', { name: 'Back to results' }));
        await settled();
        expect(document.title).toBe('ShelfLens');
        expect(window.history.scrollRestoration).not.toBe('manual');
    });

    it('moves focus to the product heading on open, and back to its card on close', async () => {
        const user = await open();
        const [first] = cards();
        if (!first) throw new Error('expected a product');
        const sku = first.getAttribute('data-sku');
        const name = first.querySelector('.card-name')?.textContent ?? '';
        await user.click(first);
        await screen.findByRole('heading', { level: 1, name });
        await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());

        await user.click(screen.getByRole('button', { name: 'Back to results' }));
        await settled();
        await waitFor(() => expect(document.activeElement).toHaveAttribute('data-sku', sku));
    });
});

describe('on a phone', () => {
    const narrow = () => {
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query.includes('max-width'),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
        }));
    };
    // The stub outlives restoreAllMocks, and the tests after these are not on a phone.
    afterEach(() => {
        vi.stubGlobal('matchMedia', undefined);
    });

    it('leaves focus alone when the results mount', async () => {
        narrow();
        await open();
        await settled();
        expect(screen.getByRole('button', { name: /Filters/ })).not.toHaveFocus();
    });

    it('keeps the facets in a drawer that is modal while open', async () => {
        narrow();
        const user = await open();
        expect(screen.queryByRole('group', { name: 'Brand' })).not.toBeInTheDocument();
        const opener = screen.getByRole('button', { name: 'Filters' });
        expect(opener).toHaveAttribute('aria-haspopup', 'dialog');

        await user.click(opener);
        const drawer = screen.getByRole('dialog', { name: 'Filters' });
        expect(drawer).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

        const [first] = within(drawer).getAllByRole('checkbox');
        if (!first) throw new Error('expected a facet');
        await user.click(first);
        await settled();
        expect(window.location.search).not.toBe('');
        expect(
            within(drawer).getByRole('button', { name: /Show \d+ results/ })
        ).toBeInTheDocument();

        const audit = await axe.run(document.body, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(audit.violations).toEqual([]);

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Filters/ })).toHaveFocus();
        // The badge's number is said as how many filters are on.
        expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toHaveTextContent('1');
    });

    it('cycles focus inside the drawer with Tab', async () => {
        narrow();
        const user = await open();
        await user.click(screen.getByRole('button', { name: 'Filters' }));
        const drawer = screen.getByRole('dialog', { name: 'Filters' });
        const done = within(drawer).getByRole('button', { name: /Show \d+ results/ });
        done.focus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
        await user.tab({ shift: true });
        expect(done).toHaveFocus();
    });
    it('keeps a half written rule while the drawer is closed to see the results', async () => {
        narrow();
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = cards()[cards().length - 1]?.getAttribute('data-sku') ?? '';
        await user.click(screen.getByRole('button', { name: 'Edit rules' }));
        const drawer = screen.getByRole('dialog', { name: 'Rules' });
        await user.click(within(drawer).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(drawer).getByRole('textbox', { name: 'Name' }), 'Last first');
        await user.type(within(drawer).getByRole('combobox', { name: 'Product' }), last);
        await user.click(within(drawer).getByRole('button', { name: 'Show the results' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await settled();
        expect(screen.getByText(/Previewing a draft/)).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Edit rules' }));
        expect(
            within(screen.getByRole('dialog', { name: 'Rules' })).getByRole('textbox', {
                name: 'Name',
            })
        ).toHaveValue('Last first');
    });
    it('keeps a half typed rule when the layout crosses the phone breakpoint', async () => {
        // A viewport the test can turn, with the listeners the page attached.
        let phone = false;
        const listeners = new Set<() => void>();
        vi.stubGlobal('matchMedia', (query: string) => ({
            get matches() {
                return phone && query.includes('max-width');
            },
            media: query,
            addEventListener: (_: string, listener: () => void) => listeners.add(listener),
            removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
        }));
        const turn = (toPhone: boolean) =>
            act(() => {
                phone = toPhone;
                for (const listener of listeners) listener();
            });
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(panel).getByRole('textbox', { name: 'Name' }), 'Last first');
        turn(true);
        await user.click(screen.getByRole('button', { name: 'Edit rules' }));
        const drawer = screen.getByRole('dialog', { name: 'Rules' });
        expect(within(drawer).getByRole('textbox', { name: 'Name' })).toHaveValue('Last first');
        await user.type(within(drawer).getByRole('combobox', { name: 'Product' }), 'SL-');
        turn(false);
        const again = screen.getByRole('complementary', { name: 'Rules' });
        expect(within(again).getByRole('textbox', { name: 'Name' })).toHaveValue('Last first');
        expect(within(again).getByRole('combobox', { name: 'Product' })).toHaveValue('SL-');
    });
});

describe('as a member', () => {
    const discounted = catalog.products.find((p) => p.price.member.min < p.price.guest.min);
    const membersOnly = catalog.products.find((p) => p.visibleTo.length === 1);
    if (!discounted || !membersOnly) throw new Error('expected a discount and a hidden product');

    it('pays less on a discounted product, from the moment the viewer changes', async () => {
        const user = await open(`?product=${discounted.sku}`);
        await screen.findByRole('heading', { level: 1, name: discounted.name });
        const asGuest = shownPrice();
        expect(asGuest).toBeGreaterThan(0);
        await shopAs(user, 'member');
        await waitFor(() => expect(shownPrice()).toBeLessThan(asGuest));
        // The product's own line, not a card's in the rail beneath it, with what a guest pays.
        expect(document.querySelector('.product-member')).toHaveTextContent(
            /^Member price, \$[\d,.]+( to \$[\d,.]+)? for guests$/
        );
        expect(screen.getByRole('table', { name: 'Sizes and colors' })).toBeInTheDocument();
        await shopAs(user, 'guest');
        await waitFor(() => expect(shownPrice()).toBe(asGuest));
        expect(document.querySelector('.product-member')).toBeNull();
    });

    it('is told what the switch changed on the page, once, until the next search', async () => {
        const user = await open('?q=jacket');
        await settled();
        expect(screen.queryByText(/Shopping as a member/)).toBeNull();
        const line = () => document.querySelector('.results-aside');
        // The member's answer is held, so the page is seen while it is on its way.
        const served = globalThis.fetch;
        let release = () => undefined as void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            await held;
            return served(input, init);
        });
        await shopAs(user, 'member');
        // The answer in hand is still the guest's, so the line waits rather than speak for it.
        expect(line()).toBeNull();
        release();
        await settled();
        const said = () =>
            screen.getAllByRole('status').filter((status) => /Shopping as/.test(status.textContent))
                .length;
        await waitFor(() => expect(said()).toBe(1));
        expect(line()?.textContent).toMatch(/^Shopping as a member: .*member price/);
        // A way of looking at the same page keeps the line and says nothing again.
        await user.click(screen.getByRole('button', { name: 'Explain ranking' }));
        expect(line()?.textContent).toMatch(/^Shopping as a member/);
        await settled();
        expect(line()?.textContent).toMatch(/^Shopping as a member/);
        // A product opened and closed keeps the line, and the switch is not said again.
        const [first] = cards();
        if (!first) throw new Error('expected a product');
        await user.click(first);
        await user.click(await screen.findByRole('button', { name: 'Back to results' }));
        await settled();
        expect(line()?.textContent).toMatch(/^Shopping as a member/);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(said()).toBe(0);
        // Switching back says the guest line, with the way to see what it hides.
        await shopAs(user, 'guest');
        await settled();
        await waitFor(() => expect(said()).toBe(1));
        expect(line()).toHaveTextContent(
            'Shopping as a guest: prices are list prices, and products for members only are hidden. Choose "Member" under "Shopping as" to see them.'
        );
        await user.type(screen.getByRole('combobox', { name: 'Search the store' }), 'boot{Enter}');
        await settled();
        expect(screen.queryByText(/Shopping as a/)).toBeNull();
    });

    it('sees a product a guest is told does not exist', async () => {
        // What each view focused was called as focus arrived, so a view reused in place is caught.
        const heard: string[] = [];
        const listen = (event: FocusEvent) => {
            const id = (event.target as Element).getAttribute('aria-labelledby') ?? '';
            heard.push(document.getElementById(id)?.textContent ?? '');
        };
        document.addEventListener('focusin', listen);
        window.history.replaceState(null, '', `/?product=${membersOnly.sku}`);
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={Promise.resolve()}
            />
        );
        const user = userEvent.setup();
        // Focus moves to the notice, which reads it once, so it is not an alert as well.
        const notice = await screen.findByRole('region', { name: /^There is no product / });
        await waitFor(() => expect(notice).toHaveFocus());
        // Focus arrives at the answer itself, not only at the loading line it replaced.
        expect(heard.at(-1)).toMatch(/^There is no product /);
        document.removeEventListener('focusin', listen);
        expect(document.title).toMatch(/^No such product/);
        expect(screen.queryByRole('alert')).toBeNull();
        // Under every missing product, a guest is told how a member would see more, and
        // hears it with the notice as focus arrives.
        expect(notice).toHaveAccessibleDescription(
            'Some products are for members only. Choose "Member" under "Shopping as" to see them.'
        );
        await shopAs(user, 'member');
        await screen.findByRole('heading', { level: 1, name: membersOnly.name });
        expect(screen.getByText('Members only')).toBeInTheDocument();
        // The switch keeps focus, since the visitor is still using it.
        expect(screen.getByRole('combobox', { name: 'Shopping as' })).toHaveFocus();
    });

    it('tells a guest nothing about members where no product is for members only', async () => {
        window.history.replaceState(null, '', '/?product=NOPE-1');
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={Promise.resolve()}
                membersOnly={false}
            />
        );
        const notice = await screen.findByRole('region', { name: /^There is no product NOPE-1/ });
        expect(notice).not.toHaveAccessibleDescription();
        expect(screen.queryByText(/for members only/)).toBeNull();
    });

    it('keeps the product and its rail on screen while a switch asks again', async () => {
        const seen = catalog.products.find((p) => p.visibleTo.length === 2);
        if (!seen) throw new Error('expected a product every viewer may see');
        const user = await open(`?product=${seen.sku}`);
        await screen.findByRole('heading', { level: 1, name: seen.name });
        const rail = () => screen.queryByRole('region', { name: /Viewed with|Most rated in/ });
        await waitFor(() => expect(rail()).not.toBeNull());
        const served = globalThis.fetch;
        let release = () => undefined as void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            await held;
            return served(input, init);
        });
        await shopAs(user, 'member');
        expect(document.querySelector('article.product')).toHaveAttribute('aria-busy', 'true');
        expect(rail()).not.toBeNull();
        release();
        await waitFor(() =>
            expect(document.querySelector('article.product')).toHaveAttribute('aria-busy', 'false')
        );
        expect(rail()).not.toBeNull();
    });
});

describe('explain mode', () => {
    it('says why each result ranked where it did, from the URL', async () => {
        const user = await open('?q=jacket&explain=1');
        await settled();
        expect(screen.getByRole('button', { name: 'Explain ranking' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        const [first, second] = cards().map((card) => card.closest('li'));
        expect(first).toHaveTextContent(featured.name);
        expect(
            within(first as HTMLElement).getByRole('list', { name: 'Why this is result 1' })
        ).toHaveTextContent('Pinned to the top by rule featured-jacket');
        expect(
            within(second as HTMLElement).getByRole('list', { name: 'Why this is result 2' })
        ).toHaveTextContent(/"jacket" matched "jacket" in the name/);

        await user.click(screen.getByRole('button', { name: 'Explain ranking' }));
        await settled();
        expect(window.location.search).toBe('?q=jacket');
        expect(screen.queryByRole('list', { name: /Why this is result/ })).toBeNull();
    });

    it('says when a sort set the merchandising aside', async () => {
        const user = await open('?q=jacket');
        await settled();
        expect(cards()[0]?.closest('li')).toHaveTextContent(featured.name);
        expect(screen.queryByText(/sets aside the pins/)).toBeNull();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-asc');
        await settled();
        // It names the rule and the way back, in the sort's own words.
        expect(screen.getByText(/sets aside the pins/)).toHaveTextContent(
            'The sort “Price, low to high” sets aside the pins, boosts and buries of the rule featured-jacket. Choose “Relevance” under “Sort by” to bring it back.'
        );
    });
});

describe('as a merchandiser', () => {
    const sku = (card: HTMLElement) => card.getAttribute('data-sku') ?? '';
    const explanation = (card: HTMLElement, rank: number) =>
        within(card.closest('li') as HTMLElement).getByRole('list', {
            name: `Why this is result ${rank}`,
        });

    it('previews a pin on the page while it is typed, then saves it as the store', async () => {
        const user = await open('?q=jacket');
        await settled();
        const before = cards().map(sku);
        const last = before[before.length - 1] ?? '';
        await user.click(screen.getByRole('button', { name: 'Rules' }));
        expect(window.location.search).toBe('?q=jacket&explain=1&rules=1');
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        expect(within(panel).getByRole('heading', { name: 'Rules for “jacket”' })).toBeVisible();
        expect(within(panel).getByRole('list', { name: 'Rules that apply' })).toHaveTextContent(
            'featured-jacket'
        );

        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(panel).getByRole('textbox', { name: 'Name' }), 'Last first');
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await settled();
        expect(screen.getByText(/Previewing a draft/)).toBeVisible();
        // Pinned in rule order: the store's pin first, then the draft's.
        const previewed = cards();
        expect(previewed.slice(0, 2).map(sku)).toEqual([featured.sku, last]);
        expect(explanation(previewed[1] as HTMLElement, 2)).toHaveTextContent(
            /Pinned to the top by rule jacket-/
        );
        // The store itself has not moved.
        expect((await fetch('http://store.test/rules').then((r) => r.json())).edited).toBe(false);

        await user.click(within(panel).getByRole('button', { name: 'Save rule' }));
        expect(await within(panel).findByRole('status')).toHaveTextContent(
            /Rule saved\. The store is now version rules\.[0-9a-f]+\./
        );
        await settled();
        expect(screen.queryByText(/Previewing a draft/)).toBeNull();
        expect(cards().slice(0, 2).map(sku)).toEqual([featured.sku, last]);
        expect(screen.getByText(/Your edited rules are in effect/)).toBeVisible();

        // Everything remembered was for the old store, so a fresh page says the same.
        await user.click(screen.getByRole('button', { name: 'Rules' }));
        await user.click(screen.getByRole('button', { name: 'Explain ranking' }));
        await settled();
        expect(cards().slice(0, 2).map(sku)).toEqual([featured.sku, last]);

        await user.click(screen.getByRole('button', { name: 'Discard your rules' }));
        await user.click(screen.getByRole('button', { name: 'Yes, discard' }));
        await waitFor(() =>
            expect(screen.queryByText(/Your edited rules are in effect/)).toBeNull()
        );
        await settled();
        expect(cards().map(sku)).toEqual(before);
    });

    it('tells the open panel when the banner gives the store its own rules back', async () => {
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = sku(cards()[cards().length - 1] as HTMLElement);
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await user.click(within(panel).getByRole('button', { name: 'Save rule' }));
        await within(panel).findByRole('status');
        const banner = screen.getByText(/Your edited rules are in effect/).closest('div');
        await user.click(
            within(banner as HTMLElement).getByRole('button', { name: 'Discard your rules' })
        );
        await user.click(
            within(banner as HTMLElement).getByRole('button', { name: 'Yes, discard' })
        );
        await waitFor(() =>
            expect(screen.queryByText(/Your edited rules are in effect/)).toBeNull()
        );
        await settled();
        await waitFor(() =>
            expect(within(panel).queryByRole('button', { name: 'Discard your rules' })).toBeNull()
        );
        expect(within(panel).getByRole('list', { name: 'Rules that apply' })).toHaveTextContent(
            'featured-jacket'
        );
        expect(within(panel).queryByRole('button', { name: 'Show every rule' })).toBeNull();
    });

    it('keeps the draft off the page once the panel closes', async () => {
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = sku(cards()[cards().length - 1] as HTMLElement);
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.click(within(panel).getByRole('radio', { name: /^Hide/ }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await settled();
        expect(cards().map(sku)).not.toContain(last);
        await user.click(within(panel).getByRole('button', { name: 'Cancel' }));
        await settled();
        expect(cards().map(sku)).toContain(last);
        await user.click(screen.getByRole('button', { name: 'Rules' }));
        expect(window.location.search).toBe('?q=jacket&explain=1');
        await waitFor(() =>
            expect(screen.queryByRole('complementary', { name: 'Rules' })).toBeNull()
        );
    });

    it('saves a hide rule, though the product it names has left the preview', async () => {
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = sku(cards()[cards().length - 1] as HTMLElement);
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.click(within(panel).getByRole('radio', { name: /^Hide/ }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await settled();
        expect(cards().map(sku)).not.toContain(last);
        await user.click(within(panel).getByRole('button', { name: 'Save rule' }));
        expect(await within(panel).findByRole('status')).toHaveTextContent(/Rule saved\./);
        await settled();
        expect(cards().map(sku)).not.toContain(last);
    });

    it('drops the draft with the panel when a new search closes it', async () => {
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = sku(cards()[cards().length - 1] as HTMLElement);
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.click(within(panel).getByRole('radio', { name: /^Hide/ }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await settled();
        expect(screen.getByText(/Previewing a draft/)).toBeVisible();
        const box = screen.getByRole('combobox', { name: 'Search the store' });
        await user.clear(box);
        await user.type(box, 'boot{Enter}');
        await settled();
        expect(window.location.search).toBe('?q=boot&explain=1');
        await user.click(screen.getByRole('button', { name: 'Rules' }));
        await settled();
        expect(screen.queryByText(/Previewing a draft/)).toBeNull();
    });
});

describe('what was searched before', () => {
    beforeEach(() => {
        localStorage.removeItem('shelflens.recent');
    });

    it('offers a search that found something on the next focus, and forgets it on request', async () => {
        const user = await open('?q=jacket');
        await settled();
        const box = screen.getByRole('combobox', { name: 'Search the store' });
        await user.clear(box);
        await user.type(box, 'boot{Enter}');
        await settled();
        await user.clear(box);
        await user.tab();
        await user.click(box);
        const recent = await screen.findByRole('listbox', { name: 'Recent searches' });
        expect(recent).toBeVisible();
        expect(
            within(recent)
                .getAllByRole('option')
                .map((option) => option.textContent)
        ).toEqual(['boot', 'jacket']);
        await user.tab();
        await user.keyboard('{Enter}');
        expect(screen.queryByRole('listbox', { name: 'Recent searches' })).toBeNull();
        expect(localStorage.getItem('shelflens.recent')).toBeNull();
    });

    it('offers a search again once it is run again after a clear', async () => {
        const user = await open('?q=jacket');
        await settled();
        const box = screen.getByRole('combobox', { name: 'Search the store' });
        await user.clear(box);
        await user.click(box);
        await screen.findByRole('listbox', { name: 'Recent searches' });
        await user.tab();
        await user.keyboard('{Enter}');
        expect(localStorage.getItem('shelflens.recent')).toBeNull();
        await user.type(box, 'jacket{Enter}');
        await settled();
        await user.clear(box);
        await user.tab();
        await user.click(box);
        expect(await screen.findByRole('listbox', { name: 'Recent searches' })).toHaveTextContent(
            'jacket'
        );
    });

    it('never offers a misspelling the store corrected', async () => {
        const user = await open('?q=jackit');
        await settled();
        expect(heading()).toHaveTextContent('showing close matches');
        const box = screen.getByRole('combobox', { name: 'Search the store' });
        await user.clear(box);
        await user.click(box);
        expect(box).toHaveAttribute('aria-expanded', 'false');
        expect(localStorage.getItem('shelflens.recent')).toBeNull();
    });

    it('never offers a search that found nothing', async () => {
        const user = await open('?q=zzqx');
        await settled();
        expect(heading()).toHaveTextContent('0 results for "zzqx"');
        const box = screen.getByRole('combobox', { name: 'Search the store' });
        await user.clear(box);
        await user.click(box);
        expect(box).toHaveAttribute('aria-expanded', 'false');
        expect(localStorage.getItem('shelflens.recent')).toBeNull();
    });
});

describe('beside a product', () => {
    const subject = catalog.products.find((p) => p.visibleTo.length === 2);
    if (!subject) throw new Error('expected a product every viewer may see');
    const peer = catalog.products.find(
        (p) =>
            p.sku !== subject.sku && p.categoryId === subject.categoryId && p.visibleTo.length === 2
    );
    if (!peer) throw new Error('expected a second product in the category');
    const rail = () => screen.queryByRole('region', { name: /Viewed with|Most rated in/ });
    const railSkus = () =>
        within(rail() ?? document.body)
            .getAllByRole('link')
            .map((link) => link.getAttribute('data-sku'));

    it('puts focus back on the card first opened, after a walk along the rail', async () => {
        const user = await open('?q=jacket');
        await settled();
        const [first] = cards();
        if (!first) throw new Error('expected a product');
        const sku = first.getAttribute('data-sku');
        await user.click(first);
        for (let step = 0; step < 2; step += 1) {
            await waitFor(() => expect(rail()).not.toBeNull());
            const next = within(rail() ?? document.body).getAllByRole('link')[0];
            if (!next) throw new Error('expected a product beside this one');
            const name = next.querySelector('.card-name')?.textContent ?? '';
            await user.click(next);
            await screen.findByRole('heading', { level: 1, name });
        }
        await user.click(screen.getByRole('button', { name: 'Back to results' }));
        await settled();
        await waitFor(() => expect(document.activeElement).toHaveAttribute('data-sku', sku));
    });

    it('shows the category’s most rated with no history, and never the product itself', async () => {
        await open(`?product=${subject.sku}`);
        await screen.findByRole('heading', { level: 1, name: subject.name });
        await waitFor(() => expect(rail()).not.toBeNull());
        expect(
            screen.getByRole('heading', { level: 2, name: /^Most rated in / })
        ).toHaveTextContent(
            catalog.categories.find((c) => c.id === subject.categoryId)?.name ?? ''
        );
        const skus = railSkus();
        expect(skus).not.toContain(subject.sku);
        expect(skus.length).toBeGreaterThan(0);
        expect(skus.length).toBeLessThanOrEqual(6);
    });

    it('leads with what this tab viewed before, once a view has arrived', async () => {
        sessionStorage.setItem('shelflens.session', 'tab-1');
        const posted = await fetch('http://store.test/events', {
            method: 'POST',
            body: JSON.stringify([
                { id: 'v1', kind: 'view', at: 1, sku: peer.sku, session: 'tab-1' },
            ]),
        });
        expect(posted.status).toBe(204);
        const user = await open(`?product=${subject.sku}`);
        await screen.findByRole('heading', { level: 1, name: subject.name });
        // One was viewed with it and the category fills the rest, and the heading says both.
        const category = catalog.categories.find((c) => c.id === subject.categoryId)?.name ?? '';
        await screen.findByRole('heading', {
            level: 2,
            name: `Viewed with this product, then most rated in ${category}`,
        });
        expect(railSkus()[0]).toBe(peer.sku);
        // The section is named by its heading, and its list is not named again.
        expect(within(rail() ?? document.body).getByRole('list')).not.toHaveAccessibleName();

        // A rail card opens its product in place, over the same results.
        await user.click(within(rail() ?? document.body).getAllByRole('link')[0] as HTMLElement);
        await screen.findByRole('heading', { level: 1, name: peer.name });
        expect(window.location.search).toBe(`?product=${peer.sku}`);
    });
});

describe('when nothing matches', () => {
    it('shows the results of a shorter phrase, one click from searching it', async () => {
        const user = await open('?q=zzqx jacket');
        await settled();
        expect(heading()).toHaveTextContent('0 results for "zzqx jacket"');
        // The heading has said it, and with nothing to narrow the facets stay out of the way.
        expect(screen.queryByText(/with these filters/)).toBeNull();
        // The word left out is named, and why.
        expect(screen.getByText(/left out/)).toHaveTextContent(
            /^No product matched every word, so "zzqx" was left out\. See all \d+ results$/
        );
        expect(screen.queryByRole('group', { name: 'Brand' })).toBeNull();
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
            'Showing results for "jacket" instead'
        );
        const offered = within(screen.getByRole('list', { name: 'Results for "jacket"' }));
        expect(offered.getAllByRole('link').length).toBeGreaterThan(0);
        await user.click(screen.getByRole('link', { name: /See all \d+ results/ }));
        await settled();
        expect(window.location.search).toBe('?q=jacket');
        expect(heading()).toHaveTextContent(/results for "jacket"/);
    });

    it('suggests a spelling two typos away', async () => {
        const user = await open('?q=jakkett');
        await settled();
        await user.click(screen.getByRole('link', { name: 'jacket' }));
        await settled();
        expect(window.location.search).toBe('?q=jacket');
    });

    it('offers to clear the filters', async () => {
        const user = await open('?q=jacket&price=0-1');
        await settled();
        expect(screen.getByText(/Nothing matched "jacket" with these filters/)).toBeInTheDocument();
        // Nothing to explain or sort, so both step aside.
        expect(screen.queryByRole('button', { name: 'Explain ranking' })).toBeNull();
        expect(screen.queryByRole('combobox', { name: 'Sort by' })).toBeNull();
        // The link has the filter column's name for the same thing, and counts in its words.
        expect(
            screen.getByRole('link', { name: 'Clear all filters' }).parentElement
        ).toHaveTextContent(/^Clear all filters to see \d+ results\.$/);
        await user.click(screen.getByRole('link', { name: 'Clear all filters' }));
        await settled();
        expect(window.location.search).toBe('?q=jacket');
        expect(cards().length).toBeGreaterThan(0);
    });

    it('keeps the facets when a filter is what found nothing, so it can be unticked', async () => {
        await open('?q=zzqx jacket&brand=Ridgeback');
        await settled();
        expect(heading()).toHaveTextContent('0 results for "zzqx jacket"');
        expect(screen.getByText(/Nothing matched "zzqx jacket" with these filters/)).toBeVisible();
        // The facet column stays, with the way out of the filter in it.
        expect(
            within(screen.getByRole('form', { name: 'Narrow the results' })).getByRole('button', {
                name: 'Clear all filters',
            })
        ).toBeInTheDocument();
    });

    it('never offers to leave the category being browsed', async () => {
        await open('?q=jacket&category=shoes');
        await settled();
        expect(heading()).toHaveTextContent('0 results for "jacket"');
        expect(screen.queryByText(/Nothing matched/)).toBeNull();
        expect(screen.queryByRole('link', { name: 'Clear all filters' })).toBeNull();
    });

    it('falls back to popular products when nothing else helps', async () => {
        await open('?q=zzqx');
        await settled();
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Popular products');
        // With nothing nearer to offer, the shopper is told what to try.
        // One word has no words to spare, so fewer is not offered.
        expect(
            screen.getByText('Try another spelling, or another word for the same thing.')
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole('list', { name: 'Popular products' })).getAllByRole('link')
        ).toHaveLength(8);
    });
});

describe('the tour', () => {
    it('opens on a first visit, stays closed once finished, and reopens on request', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        expect(tour).toHaveTextContent('Stop 1 of');
        expect(screen.getByRole('button', { name: 'Tour' })).toHaveAttribute(
            'aria-expanded',
            'true'
        );

        await user.click(within(tour).getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('complementary', { name: 'Tour' })).toBeNull();
        expect(localStorage.getItem('shelflens.tour')).toBe('seen');

        expect(screen.getByRole('button', { name: 'Tour' })).toHaveFocus();

        await user.click(screen.getByRole('button', { name: 'Tour' }));
        const reopened = screen.getByRole('complementary', { name: 'Tour' });
        expect(within(reopened).getByRole('button', { name: 'Close' })).toHaveFocus();
    });

    it('resumes at the stop it was closed on', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        await user.click(within(tour).getByRole('button', { name: 'Next' }));
        await user.click(within(tour).getByRole('button', { name: 'Next' }));
        expect(tour).toHaveTextContent('Stop 3 of');
        await user.click(within(tour).getByRole('button', { name: 'Close' }));
        await user.click(screen.getByRole('button', { name: 'Tour' }));
        expect(screen.getByRole('complementary', { name: 'Tour' })).toHaveTextContent('Stop 3 of');
    });

    it('leads to the page each stop describes, and stays open there', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        for (let i = 0; i < 4; i += 1) {
            await user.click(within(tour).getByRole('button', { name: 'Next' }));
        }
        expect(tour).toHaveTextContent('The cache that forgets who is asking');
        await user.click(within(tour).getByRole('link', { name: 'Try it' }));
        expect(window.location.search).toBe('?product=SL-00008');
        expect(await screen.findByText(/There is no product/)).toBeInTheDocument();
        expect(screen.getByRole('complementary', { name: 'Tour' })).toBeInTheDocument();
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
