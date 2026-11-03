import { formatPriceRange } from '../format/money.js';
import { ratingText } from '../format/rating.js';
import type { ProductQuery } from '../generated/operations.js';

type Product = NonNullable<ProductQuery['product']>;

/** Brand, material and rating, leaving out what a catalog does not have, so no dot leads nowhere. */
export const metaLine = (
    product: Pick<Product, 'brand' | 'material' | 'rating'>,
    locale: string
): string =>
    [
        product.brand.name,
        product.material,
        product.rating && ratingText(product.rating.average, product.rating.count, locale),
    ]
        .filter((part) => typeof part === 'string' && part.trim() !== '')
        .join(' · ');

/** The member line, with what a guest pays beside it, so a member sees what the price saves. */
export const memberLine = (price: Product['price'], locale: string): string =>
    price.listPrice
        ? `Member price, ${formatPriceRange(price.listPrice.min, price.listPrice.max, locale)} for guests`
        : 'Member price';
