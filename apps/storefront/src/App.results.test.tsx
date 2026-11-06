import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { nth } from './test/dom.js';
import { cards, catalog, facet, heading, open, settled } from './test/store.jsx';

/* Finding things: browsing, narrowing, counting, paging, searching, a search that finds nothing, what was searched before, and where focus is and what is said as the results change. */

describe('browsing', () => {
    it('shows every product in catalog order with the facets beside them', async () => {
        await open();
        expect(heading()).toHaveTextContent(/^All products, [\d,]+ products$/);
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
            within(facet('Category')).getByRole('link', {
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

    it('narrows to a ticked size, as many products as the size counted', async () => {
        const user = await open();
        const size = nth(within(facet('Size')).getAllByRole('checkbox'), 0, 'a size');
        const counted = /, ([\d,]+) results?$/.exec(size.closest('label')?.textContent ?? '')?.[1];
        if (counted === undefined) throw new Error('the size should say how many it counts');
        await user.click(size);
        await settled();
        expect(new URLSearchParams(window.location.search).getAll('size')).toEqual([
            size.getAttribute('value'),
        ]);
        expect(heading()).toHaveTextContent(new RegExp(`^All products, ${counted} products?$`));
    });

    it('offers a category and the way up as links to their pages, and follows a plain click in place', async () => {
        const user = await open('?category=clothing');
        await settled();
        const group = facet('Category');
        const child = catalog.categories.find(
            (category) => category.path[0] === 'clothing' && category.path.length === 2
        );
        if (!child) throw new Error('expected a child of clothing');
        const link = within(group).getByRole('link', {
            name: new RegExp(`^${child.name}, \\d+ results?$`),
        });
        // A real link, so it can open in a new tab, be copied, and be read as a link.
        expect(link).toHaveAttribute('href', `?category=${child.id}`);
        expect(within(group).getByRole('link', { name: 'All categories' })).toHaveAttribute(
            'href',
            '?'
        );
        // A click with a modifier is the browser's, for a new tab or window, so the page leaves it
        // alone and stays where it is.
        expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
        expect(window.location.search).toBe('?category=clothing');
        await user.click(link);
        await settled();
        expect(window.location.search).toBe(`?category=${child.id}`);
    });

    it('keeps the category group at a category with no children, with the way up above it', async () => {
        const user = await open('?category=outerwear');
        await settled();
        const group = facet('Category');
        expect(within(group).getByText('Outerwear')).toHaveAttribute('aria-current', 'location');
        await user.click(within(group).getByRole('link', { name: 'Clothing' }));
        await settled();
        expect(window.location.search).toBe('?category=clothing');
        // From a root category the way up is to every category, with the category left out.
        await user.click(within(facet('Category')).getByRole('link', { name: 'All categories' }));
        await settled();
        expect(window.location.search).toBe('');
    });

    it('shows the stars of each rating band, and says the band in words alone', async () => {
        await open();
        const four = within(facet('Rating')).getByRole('radio', {
            name: /^4 stars and up, \d+ results?$/,
        });
        const row = four.closest('label');
        expect(row?.querySelector('.stars')).toHaveAttribute('aria-hidden', 'true');
    });

    it('removes a filter by its chip, and puts focus on the chip that takes its place, then the heading', async () => {
        const user = await open();
        const [first, second] = within(facet('Brand')).getAllByRole('checkbox');
        if (!first || !second) throw new Error('expected two brands');
        await user.click(first);
        await settled();
        await user.click(second);
        await settled();
        const chips = () => screen.getByRole('list', { name: 'Filters on' });
        const [one, two] = within(chips()).getAllByRole('button', { name: /^Remove / });
        const secondName = two?.getAttribute('aria-label') ?? '';
        if (!one) throw new Error('expected a chip');
        await user.click(one);
        await settled();
        await waitFor(() =>
            expect(within(chips()).getByRole('button', { name: secondName })).toHaveFocus()
        );
        await user.click(within(chips()).getByRole('button', { name: secondName }));
        await settled();
        expect(window.location.search).toBe('');
        await waitFor(() => expect(heading()).toHaveFocus());
    });

    it('offers no second way to clear the filters in the column, since the chips have one', async () => {
        const user = await open();
        const [first] = within(facet('Brand')).getAllByRole('checkbox');
        if (!first) throw new Error('expected a brand');
        await user.click(first);
        await settled();
        expect(
            within(screen.getByRole('form', { name: 'Narrow the results' })).queryByRole('button', {
                name: 'Clear all filters',
            })
        ).toBeNull();
        expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
    });

    it('clears the filters and leaves the rules panel open', async () => {
        const user = await open('?q=jacket&rules=1&explain=1&brand=Ridgeback');
        await settled();
        await user.click(
            within(screen.getByRole('list', { name: 'Filters on' })).getByRole('button', {
                name: 'Clear all',
            })
        );
        await settled();
        expect(window.location.search).toBe('?q=jacket&explain=1&rules=1');
    });

    it('keeps an order of the shopper’s own on the way up to every category', async () => {
        const user = await open('?category=clothing&sort=price-asc');
        await settled();
        const up = within(facet('Category')).getByRole('link', { name: 'All categories' });
        expect(up).toHaveAttribute('href', '?sort=price-asc');
        await user.click(up);
        await settled();
        expect(window.location.search).toBe('?sort=price-asc');
    });

    it('drops a category’s own order with the category, on the way up to every category', async () => {
        const user = await open('?category=clothing&sort=position');
        await settled();
        await user.click(within(facet('Category')).getByRole('link', { name: 'All categories' }));
        await settled();
        expect(window.location.search).toBe('');
    });

    it('shows a rating the address chose that no band counts, checked, as its chip does', async () => {
        await open('?rating=5');
        await settled();
        expect(
            within(facet('Rating')).getByRole('radio', { name: '5 stars and up' })
        ).toBeChecked();
        expect(
            screen.getByRole('button', { name: 'Remove rating 5 stars and up' })
        ).toBeInTheDocument();
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

        // The filters on are chips under the heading, the price and the rating among them.
        const chips = screen.getByRole('list', { name: 'Filters on' });
        expect(
            within(chips).getByRole('button', { name: 'Remove price Under $50' })
        ).toBeInTheDocument();
        expect(
            within(chips).getByRole('button', { name: 'Remove rating 4 stars and up' })
        ).toBeInTheDocument();
        await user.click(within(chips).getByRole('button', { name: 'Clear all' }));
        await settled();
        expect(window.location.search).toBe('');
        // The chips go with the filters, and focus moves to the results heading.
        expect(screen.queryByRole('list', { name: 'Filters on' })).not.toBeInTheDocument();
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
        await user.click(nth(within(facet('Color')).getAllByRole('checkbox'), 0, 'a color'));
        await settled();
        expect(window.location.search).toMatch(/^\?color=/);

        act(() => {
            window.history.back();
        });
        // The browser moves back on a task of its own, so the address is waited for.
        await waitFor(() => expect(window.location.search).toBe(''));
        await settled();
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
        await user.click(nth(within(facet('Brand')).getAllByRole('checkbox'), 0, 'a brand'));
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
        // The facet column stays, so the filter can be unticked there, and its chip removes it too.
        expect(
            within(screen.getByRole('form', { name: 'Narrow the results' })).getByRole('checkbox', {
                name: /Ridgeback/,
            })
        ).toBeChecked();
        expect(screen.getByRole('button', { name: 'Remove brand Ridgeback' })).toBeInTheDocument();
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

describe('keeping place on the results', () => {
    it('keeps a ticked filter in its group, checked, when nothing else in the group matches', async () => {
        await open('?color=Nowhere');
        const nowhere = within(facet('Color')).getByRole('checkbox', { name: /Nowhere/ });
        expect(nowhere).toBeChecked();
        // The answer gave it no count, so none is made up.
        expect(nowhere.parentElement?.querySelector('.hint')).toBeNull();
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

describe('saying what changed', () => {
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
});
