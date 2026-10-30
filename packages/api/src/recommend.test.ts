import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { type Context, createStore, viewerFromHeader } from './context.js';
import type { StoreEvent } from './events.js';
import { recommend, viewedWith } from './recommend.js';

/*
 * The cold start, and what replaces it: with no history the rail is the
 * category's most rated, never the product itself. With views in the same
 * tab, those lead and say so. Nothing a viewer may not see gets in either
 * way.
 */

const catalog = generateCatalog({ seed: 42, products: 500 });
const store = createStore({ catalog });
const guest = viewerFromHeader(undefined);
const member = viewerFromHeader('member');

const context = (viewer = guest): Context => ({
    store,
    viewer,
    now: new Date(0),
    events: undefined,
    answer: { volatile: false },
});

const view = (sku: string, session: string, at = 1): StoreEvent => ({
    id: `${session}-${sku}-${at}`,
    kind: 'view',
    at,
    sku,
    session,
});

const membersOnly = catalog.products.find((p) => p.visibleTo.length === 1);
if (!membersOnly) throw new Error('expected a members-only product');
const subject = catalog.products.find(
    (p) => p.visibleTo.length === 2 && p.categoryId !== membersOnly.categoryId
);
if (!subject) throw new Error('expected a product every viewer may see');
const inCategory = (categoryId: string) =>
    catalog.products.filter((p) => p.categoryId === categoryId && p.visibleTo.includes('guest'));

describe('what was viewed together', () => {
    it('counts the other products viewed in tabs that viewed this one, most often first', () => {
        const events = [
            view('A', 't1'),
            view('B', 't1', 2),
            view('C', 't1', 3),
            view('A', 't2'),
            view('C', 't2', 5),
            view('B', 't3'),
            view('D', 't3', 9),
        ];
        expect(viewedWith(events, 'A')).toEqual(['C', 'B']);
        expect(viewedWith(events, 'D')).toEqual(['B']);
        expect(viewedWith(events, 'Z')).toEqual([]);
    });

    it('breaks a tie by the most recent view, then by sku', () => {
        const events = [
            view('A', 't1'),
            view('B', 't1', 2),
            view('C', 't1', 7),
            view('D', 't1', 7),
        ];
        expect(viewedWith(events, 'A')).toEqual(['C', 'D', 'B']);
    });

    it('takes the tab asking to have viewed this product already', () => {
        const events = [view('A', 't1', 1), view('B', 't1', 2)];
        expect(viewedWith(events, 'C', 't1')).toEqual(['B', 'A']);
        expect(viewedWith(events, 'C', 't9')).toEqual([]);
    });

    it('reads only views that carry a tab, and never counts the product itself', () => {
        const events: StoreEvent[] = [
            view('A', 't1'),
            view('A', 't1', 2),
            { id: 'x', kind: 'view', at: 3, sku: 'B' },
            { id: 'y', kind: 'click', at: 4, sku: 'C', session: 't1' },
        ];
        expect(viewedWith(events, 'A')).toEqual([]);
    });
});

describe('the rail', () => {
    it('is the category’s most rated with no history, never the product itself', () => {
        const rail = recommend({ sku: subject.sku, limit: 6 }, [], context());
        expect(rail?.source).toBe('CATEGORY_BESTSELLERS');
        expect(rail?.category.id).toBe(subject.categoryId);
        const skus = rail?.items.map((p) => p.sku) ?? [];
        expect(skus).not.toContain(subject.sku);
        expect(skus.length).toBe(Math.min(6, inCategory(subject.categoryId).length - 1));
        for (const item of rail?.items ?? []) expect(item.categoryId).toBe(subject.categoryId);
        const counts = rail?.items.map((p) => p.rating.count) ?? [];
        expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });

    it('leads with what was viewed together, filled with the most rated, and says so', () => {
        const [other] = inCategory(membersOnly.categoryId).filter((p) => p.sku !== subject.sku);
        if (!other) throw new Error('expected another product');
        const rail = recommend(
            { sku: subject.sku, limit: 4 },
            [view(other.sku, 't1'), view(subject.sku, 't1', 2)],
            context()
        );
        expect(rail?.source).toBe('VIEWED_TOGETHER');
        expect(rail?.items[0]?.sku).toBe(other.sku);
        expect(rail?.items).toHaveLength(4);
        expect(new Set(rail?.items.map((p) => p.sku)).size).toBe(4);
    });

    it('never shows a guest a product only members may see, by either source', () => {
        const events = [view(membersOnly.sku, 't1'), view(subject.sku, 't1', 2)];
        const asGuest = recommend({ sku: subject.sku, limit: 6 }, events, context());
        expect(asGuest?.source).toBe('CATEGORY_BESTSELLERS');
        expect(asGuest?.items.map((p) => p.sku)).not.toContain(membersOnly.sku);
        const asMember = recommend({ sku: subject.sku, limit: 6 }, events, context(member));
        expect(asMember?.items[0]?.sku).toBe(membersOnly.sku);
        const peers = recommend({ sku: membersOnly.sku, limit: 6 }, [], context());
        expect(peers).toBeNull();
    });

    it('is nothing for a product the store does not have, and empty alone in its category', () => {
        expect(recommend({ sku: 'SL-99999', limit: 6 }, [], context())).toBeNull();
        const lone = createStore({
            catalog: { ...catalog, products: [subject] },
        });
        const rail = recommend({ sku: subject.sku, limit: 6 }, [], { ...context(), store: lone });
        expect(rail?.items).toEqual([]);
    });

    it('keeps the limit within bounds', () => {
        expect(recommend({ sku: subject.sku, limit: 100 }, [], context())?.items.length).toBe(12);
        expect(recommend({ sku: subject.sku, limit: -1 }, [], context())?.items).toEqual([]);
    });
});
