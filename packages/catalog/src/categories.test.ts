import { describe, expect, it } from 'vitest';

import { categoryNames } from './categories.js';
import { generateCatalog } from './generate.js';

describe('the category names', () => {
    it('name every category on every product path', () => {
        const catalog = generateCatalog({ products: 50 });
        const names = categoryNames(catalog);
        for (const product of catalog.products) {
            for (const id of product.categoryPath) expect(names.get(id)).toBeTruthy();
        }
        const first = catalog.categories[0];
        expect(first && names.get(first.id)).toBe(first?.name);
    });
});
