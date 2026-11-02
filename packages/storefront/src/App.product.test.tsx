import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductDocument } from './generated/operations.js';
import { cards, catalog, open, settled } from './test/store.jsx';

/* A product over its results: what it says while it loads, where focus goes and returns, and what stands beside it. */

describe('a product over its results', () => {
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
