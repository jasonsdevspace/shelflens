import type { Category, Product } from '@shelflens/catalog';
import { searchStore } from '@shelflens/search';

import type { Context } from './context.js';
import type { StoreEvent } from './events.js';

/**
 * What to show beside a product.
 *
 * Two sources, blended in one order. First the products viewed in the
 * same tab as this one, most often first, from the events the host has
 * collected. Then, to fill the list, the most rated products in the
 * product's own category, found through the store like any search so
 * what a viewer may not see stays out. The product itself is never in
 * the list, and the list says which source leads it, so the page can say
 * so too rather than dressing bestsellers up as a signal.
 *
 * The tab asking is taken to have viewed the product already. Its own
 * view may still be on its way, and a shopper who viewed one product and
 * opened a second expects the first beside it now, not after a reload.
 */

export type RecommendationSource = 'VIEWED_TOGETHER' | 'CATEGORY_BESTSELLERS';

export interface RecommendationsModel {
    readonly source: RecommendationSource;
    readonly category: Category;
    readonly items: readonly Product[];
    /** How many of the items, from the first, were viewed with this product. */
    readonly viewedTogether: number;
}

export interface RecommendationRequest {
    readonly sku: string;
    readonly limit: number;
    /** The tab asking, whose earlier views count as viewed with this product. */
    readonly session?: string | undefined;
}

/** The most a rail may ask for. */
export const RECOMMENDATION_LIMIT = 12;

interface Seen {
    count: number;
    latest: number;
}

/**
 * The products viewed in a tab that also viewed this one, most often first,
 * then most recently, then by sku so the order is the same every time.
 */
export const viewedWith = (
    events: readonly StoreEvent[],
    sku: string,
    session?: string
): readonly string[] => {
    const tabs = new Map<string, Map<string, number>>();
    for (const event of events) {
        if (event.kind !== 'view' || event.sku === undefined || event.session === undefined) {
            continue;
        }
        const views = tabs.get(event.session) ?? new Map<string, number>();
        views.set(event.sku, Math.max(views.get(event.sku) ?? 0, event.at));
        tabs.set(event.session, views);
    }
    const seen = new Map<string, Seen>();
    for (const [tab, views] of tabs) {
        if (!views.has(sku) && tab !== session) continue;
        for (const [other, at] of views) {
            if (other === sku) continue;
            const entry = seen.get(other) ?? { count: 0, latest: 0 };
            entry.count += 1;
            entry.latest = Math.max(entry.latest, at);
            seen.set(other, entry);
        }
    }
    return [...seen.entries()]
        .sort(([a, x], [b, y]) => y.count - x.count || y.latest - x.latest || a.localeCompare(b))
        .map(([other]) => other);
};

/** The most rated products the viewer may see in a category, through the store's own search. */
const bestsellers = (categoryId: string, limit: number, context: Context): readonly Product[] =>
    searchStore(context.store.engine, {
        group: context.viewer.group,
        filters: [{ attribute: 'category', eq: categoryId }],
        sort: [
            { by: 'ratingCount', direction: 'desc' },
            { by: 'rating', direction: 'desc' },
        ],
        pageSize: limit,
        facets: [],
        now: context.now,
    }).hits.flatMap((hit) => {
        const product = context.store.products.get(hit.id);
        return product ? [product] : [];
    });

export const recommend = (
    { sku, limit, session }: RecommendationRequest,
    events: readonly StoreEvent[],
    context: Context
): RecommendationsModel | null => {
    const { store, viewer } = context;
    const product = store.products.get(sku);
    if (!product?.visibleTo.includes(viewer.group)) return null;
    const category = store.categories.get(product.categoryId);
    if (!category) return null;
    const wanted = Math.min(Math.max(limit, 0), RECOMMENDATION_LIMIT);

    const items: Product[] = [];
    const taken = new Set<string>([sku]);
    const take = (candidate: Product | undefined) => {
        if (!candidate || taken.has(candidate.sku) || items.length >= wanted) return;
        if (!candidate.visibleTo.includes(viewer.group)) return;
        taken.add(candidate.sku);
        items.push(candidate);
    };
    for (const other of viewedWith(events, sku, session)) take(store.products.get(other));
    const together = items.length;
    // One more than wanted, since the product itself may be among its category's best.
    for (const best of bestsellers(product.categoryId, wanted + 1, context)) take(best);

    return {
        source: together > 0 ? 'VIEWED_TOGETHER' : 'CATEGORY_BESTSELLERS',
        category,
        items,
        viewedTogether: together,
    };
};
