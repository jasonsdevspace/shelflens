import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductDocument } from './generated/operations.js';
import { cards, catalog, facet, heading, open, settled } from './test/store.jsx';

/* A product over its results: where focus goes and returns, and what stands beside it. */

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
