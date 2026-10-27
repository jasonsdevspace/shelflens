import { gzipSync } from 'node:zlib';

import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

/**
 * The demo ships the default catalog to the browser and indexes it there.
 * This is the budget for that download, compressed as the server would
 * serve it. Measured at about 333 KB when it was set.
 */
const CATALOG_BUDGET_BYTES = 400 * 1024;

describe('the catalog the demo ships', () => {
    it('stays within its download budget', () => {
        const compressed = gzipSync(JSON.stringify(generateCatalog()));
        expect(compressed.length).toBeLessThan(CATALOG_BUDGET_BYTES);
    });
});
