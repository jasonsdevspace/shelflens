import type { Hit, SearchResult } from '@jasonsdevspace/shelflens';
import type { Product } from '@shelflens/catalog';

import type { Context } from './context.js';

/** A hit paired with its product, which the hit's id names. */
export interface HitModel {
    readonly hit: Hit;
    readonly product: Product;
}

/**
 * Each hit with the product it names, in the order found, leaving out any
 * the store does not hold. The one place a search's hits become products,
 * for the results, the nothing-found page and the rail alike.
 */
export const hitsOf = (result: SearchResult, context: Context): HitModel[] =>
    result.hits.flatMap((hit) => {
        const product = context.store.products.get(hit.id);
        return product ? [{ hit, product }] : [];
    });
