import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SAMPLE_PATH, sampleCsv } from './sample.js';

/**
 * Writes the sample file into the storefront's public folder.
 *
 *   npm run sample --workspace @shelflens/storefront
 */
const out = join('public', SAMPLE_PATH);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sampleCsv());
console.log(`wrote ${out}`);
