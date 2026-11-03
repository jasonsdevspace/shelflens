// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type SizeResult, supportedCap } from '../bench/sizes.js';
import { CATALOG_FILE_BYTES_CAP, CATALOG_ROW_CAP } from './limits.js';

const record = JSON.parse(
    readFileSync(new URL('../../../../docs/benchmarks/catalog-size.json', import.meta.url), 'utf8')
) as { results: SizeResult[] };

const timing = (p95Ms: number) => ({ samples: 1, p50Ms: p95Ms, p95Ms, maxMs: p95Ms });
const measured = (products: number, p95Ms: number): SizeResult => ({
    products,
    catalogBytes: 0,
    parseMs: 0,
    buildMs: 0,
    suggest: timing(p95Ms),
    search: timing(p95Ms),
});

describe('the catalog limits', () => {
    it('cap rows at the largest size the benchmark record supports', () => {
        expect(CATALOG_ROW_CAP).toBe(supportedCap(record.results));
    });

    it('leave room in the byte cap for a catalog at the row cap, written loosely', () => {
        const atCap = record.results.find((result) => result.products === CATALOG_ROW_CAP);
        expect(atCap).toBeDefined();
        expect((atCap?.catalogBytes ?? Infinity) * 2).toBeLessThanOrEqual(CATALOG_FILE_BYTES_CAP);
    });

    it('refuse a size whose store takes longer than the start budget on a phone', () => {
        expect(supportedCap([{ ...measured(2000, 1), buildMs: 600 }])).toBe(0);
    });

    it('take the largest size that fits on a phone, with every smaller one fitting', () => {
        expect(supportedCap([measured(2000, 1), measured(10_000, 12), measured(25_000, 13)])).toBe(
            10_000
        );
        expect(supportedCap([measured(2000, 1), measured(5000, 20), measured(10_000, 3)])).toBe(
            2000
        );
        expect(supportedCap([measured(2000, 13)])).toBe(0);
    });
});
