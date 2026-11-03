import type { Catalog } from './types.js';

/** Each category's name by its id, since a product's path names its categories only by id. */
export const categoryNames = (catalog: Catalog): ReadonlyMap<string, string> =>
    new Map(catalog.categories.map((category) => [category.id, category.name]));
