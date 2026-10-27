import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_PRODUCTS, DEFAULT_SEED, generateCatalog } from './generate.js';

/**
 * Writes a catalog to disk.
 *
 *   npm run catalog -- --out data/catalog.json
 *   npm run catalog -- --seed 7 --products 100000 --out /tmp/big.json
 *
 * The demo and the tests generate catalogs in memory. This exists for the
 * snapshot the demo ships, and for anyone who wants to look at the data.
 */
const { values } = parseArgs({
    options: {
        seed: { type: 'string', default: String(DEFAULT_SEED) },
        products: { type: 'string', default: String(DEFAULT_PRODUCTS) },
        out: { type: 'string' },
    },
});

const seed = Number(values.seed);
const products = Number(values.products);
if (!Number.isInteger(seed) || !Number.isInteger(products) || products < 1) {
    console.error('seed must be an integer and products a positive integer');
    process.exit(2);
}

const catalog = generateCatalog({ seed, products });
const json = `${JSON.stringify(catalog, null, 2)}\n`;

if (values.out) {
    mkdirSync(dirname(values.out), { recursive: true });
    writeFileSync(values.out, json);
    console.error(
        `wrote ${catalog.products.length} products, version ${catalog.version}, to ${values.out}`
    );
} else {
    process.stdout.write(json);
}
