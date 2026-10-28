import { generateCatalog } from '@shelflens/catalog';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.jsx';
import { createWorkerApi } from './worker/handle.js';
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

beforeAll(() => {
    const worker = createWorkerApi({
        catalogUrl: 'catalog.json',
        rulesUrl: 'rules.json',
        fetch: serving(catalog, { rules }),
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await worker.handle(new Request(input, init));
        return response ?? new Response('not found', { status: 404 });
    });
});

beforeEach(() => {
    window.history.replaceState(null, '', '/');
    // The tour opens itself on a first visit. These tests are not that visit.
    localStorage.setItem('shelflens.tour', 'seen');
});

afterEach(() => {
    vi.restoreAllMocks();
});

const open = async (search = '') => {
    window.history.replaceState(null, '', `/${search}`);
    render(<App apiUrl="http://store.test/graphql" ready={Promise.resolve()} />);
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

describe('browsing', () => {
    it('shows every product in catalog order with the facets beside them', async () => {
        await open();
        expect(heading()).toHaveTextContent('All products');
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
        expect(heading()).toHaveTextContent(root.name);
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
            within(facet('Category')).getByRole('button', { name: new RegExp(child.name) })
        ).toBeInTheDocument();
    });
});

describe('narrowing', () => {
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

        await user.click(within(facet('Rating')).getByRole('radio', { name: /4 and up/ }));
        await settled();
        expect(window.location.search).toBe('?price=-50&rating=4');

        await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
        await settled();
        expect(window.location.search).toBe('');
        expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
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

describe('on a phone', () => {
    const narrow = () => {
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query.includes('max-width'),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
        }));
    };

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
        expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('1');
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
        await shopAs(user, 'guest');
        await waitFor(() => expect(shownPrice()).toBe(asGuest));
    });

    it('sees a product a guest is told does not exist', async () => {
        window.history.replaceState(null, '', `/?product=${membersOnly.sku}`);
        render(<App apiUrl="http://store.test/graphql" ready={Promise.resolve()} />);
        const user = userEvent.setup();
        expect(await screen.findByRole('alert')).toHaveTextContent('There is no product');
        await shopAs(user, 'member');
        await screen.findByRole('heading', { level: 1, name: membersOnly.name });
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
        expect(screen.queryByText(/set aside the merchandising/)).toBeNull();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-asc');
        await settled();
        expect(screen.getByText(/set aside the merchandising/)).toHaveTextContent(
            'Sorting by price, low to high set aside the merchandising: featured-jacket.'
        );
    });
});

describe('when nothing matches', () => {
    it('shows the results of a shorter phrase, one click from searching it', async () => {
        const user = await open('?q=zzqx jacket');
        await settled();
        expect(heading()).toHaveTextContent('0 results for "zzqx jacket"');
        expect(screen.getByText(/Nothing matched "zzqx jacket"/)).toBeInTheDocument();
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
        await user.click(screen.getByRole('link', { name: 'Clear the filters' }));
        await settled();
        expect(window.location.search).toBe('?q=jacket');
        expect(cards().length).toBeGreaterThan(0);
    });

    it('never offers to leave the category being browsed', async () => {
        await open('?q=jacket&category=shoes');
        await settled();
        expect(screen.getByText(/Nothing matched "jacket"\./)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Clear the filters' })).toBeNull();
    });

    it('falls back to popular products when nothing else helps', async () => {
        await open('?q=zzqx');
        await settled();
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Popular products');
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
        for (let i = 0; i < 3; i += 1) {
            await user.click(within(tour).getByRole('button', { name: 'Next' }));
        }
        expect(tour).toHaveTextContent('A cache key that forgets who is asking');
        await user.click(within(tour).getByRole('link', { name: 'Try it' }));
        expect(window.location.search).toBe('?product=SL-00008');
        expect(await screen.findByRole('alert')).toHaveTextContent('There is no product');
        expect(screen.getByRole('complementary', { name: 'Tour' })).toBeInTheDocument();
    });
});
