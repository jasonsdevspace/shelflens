import { gzipSync } from 'node:zlib';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

/*
 * The API has to run in a service worker, which has no Node and no file
 * system. Bundling it for a browser is the proof: an import of anything
 * Node-only fails the build, and the result has a size budget, since a
 * worker downloads it. Measured at 59 KB compressed when the budget was set.
 */
const BUDGET_BYTES = 90 * 1024;

describe('the API in a browser', () => {
    it('bundles for a browser with nothing from Node, within its budget', async () => {
        const result = await build({
            stdin: {
                contents: `export * from './packages/api/src/index.ts';`,
                resolveDir: new URL('../../..', import.meta.url).pathname,
                loader: 'ts',
            },
            bundle: true,
            platform: 'browser',
            format: 'esm',
            minify: true,
            write: false,
            logLevel: 'silent',
            alias: {
                '@shelflens/catalog': './packages/catalog/src/index.ts',
                '@jasonsdevspace/shelflens': './packages/engine/src/index.ts',
                '@shelflens/search': './packages/search/src/index.ts',
            },
        });
        const [output] = result.outputFiles;
        expect(output).toBeDefined();
        const compressed = gzipSync(output?.contents ?? new Uint8Array()).length;
        expect(compressed).toBeLessThan(BUDGET_BYTES);
    }, 60_000);
});
