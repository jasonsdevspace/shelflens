import { generateCatalog, type Product } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { GOLDEN_CASES } from './golden.js';
import { createStoreEngine, searchStore } from './store.js';

const catalog = generateCatalog();
const engine = createStoreEngine(catalog);
const bySku = new Map(catalog.products.map((product) => [product.sku, product]));
const product = (sku: string): Product => {
    const found = bySku.get(sku);
    if (!found) throw new Error(`no product ${sku}`);
    return found;
};

describe('golden queries on the default catalog', () => {
    it.each(GOLDEN_CASES.map((golden) => [golden.query, golden]))('%s', (_query, golden) => {
        const top = golden.top ?? 5;
        const result = searchStore(engine, {
            group: 'guest',
            query: golden.query,
            pageSize: top,
            ...(golden.prefixLastTerm && { prefixLastTerm: true }),
        });
        const products = result.hits.map((hit) => product(hit.id));
        const failing = products.filter((p) => !golden.expect(p)).map((p) => p.name);

        expect(result.total, golden.because).toBeGreaterThanOrEqual(golden.atLeast ?? top);
        expect(
            failing,
            `${golden.because}, but the top results included ${failing.join(', ')}`
        ).toEqual([]);
        if (golden.mode) expect(result.mode).toBe(golden.mode);
    });

    it('finds nothing for nonsense, rather than something', () => {
        const result = searchStore(engine, { group: 'guest', query: 'xqzv wpf' });
        expect(result.total).toBe(0);
        expect(result.mode).toBe('none');
    });
});
