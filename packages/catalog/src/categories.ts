import type { Catalog } from './types.js';

/** Each category's name by its id, for a product's path, which names its categories by id. */
export const categoryNames = (catalog: Catalog): ReadonlyMap<string, string> =>
    new Map(catalog.categories.map((category) => [category.id, category.name]));
