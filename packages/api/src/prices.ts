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

/**
 * Whether a member's price differs from a guest's for a product, lower or
 * higher, at either end. Where it does, switching between them changes what
 * the page shows, so the switch is worth offering.
 */
export const pricesDiffer = (product: Product): boolean =>
    product.price.member.min !== product.price.guest.min ||
    product.price.member.max !== product.price.guest.max;
