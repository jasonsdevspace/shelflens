import type { CustomerGroup, Product } from '@shelflens/catalog';

/**
 * Whether a group pays less than a guest for a product, at its lowest price
 * or its highest. The one rule for a member price, so a product's line, the
 * store's own word on whether it has member prices, and the switch between
 * viewers never disagree, even where members pay less only on larger sizes.
 */
export const paysLess = (product: Product, group: CustomerGroup): boolean =>
    product.price[group].min < product.price.guest.min ||
    product.price[group].max < product.price.guest.max;
