import { count } from '../format/count.js';
import { formatPriceRange } from '../format/money.js';
import type { ProductQuery } from '../generated/operations.js';

type Product = NonNullable<ProductQuery['product']>;

/** Brand, material and rating, leaving out what a catalog does not have, so no dot leads nowhere. */
export const metaLine = (product: Pick<Product, 'brand' | 'material' | 'rating'>): string =>
    [
        product.brand.name,
        product.material,
        product.rating &&
            `${product.rating.average.toFixed(1)} out of 5, from ${count(product.rating.count, 'rating', 'ratings')}`,
    ]
        .filter((part) => typeof part === 'string' && part.trim() !== '')
        .join(' · ');

/** The member line, with what a guest pays beside it, so a member sees what the price saves. */
export const memberLine = (price: Product['price'], locale: string): string =>
    price.listPrice
        ? `Member price, ${formatPriceRange(price.listPrice.min, price.listPrice.max, locale)} for guests`
        : 'Member price';
