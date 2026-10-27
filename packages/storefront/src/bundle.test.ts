// @vitest-environment node
import { gzipSync } from 'node:zlib';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

/*
 * The page's download budget.
 *
 * The popover is the first thing a shopper waits for, so the page that
 * carries it has a size budget the build enforces. React is most of it.
 * Measured at 72 KB compressed when the budget was set, and the page must
 * hold nothing from GraphQL: the operations are generated as strings so
 * no parser or printer is needed in the browser.
 */
const BUDGET_BYTES = 100 * 1024;

describe('the page in a browser', () => {
    it('stays within its download budget, with nothing from GraphQL in it', async () => {
        const result = await build({
            entryPoints: [new URL('./main.tsx', import.meta.url).pathname],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            minify: true,
            write: false,
            logLevel: 'silent',
            jsx: 'automatic',
            loader: { '.css': 'empty' },
            define: {
                'import.meta.env.BASE_URL': '"/"',
                'import.meta.env.DEV': 'false',
                'process.env.NODE_ENV': '"production"',
            },
            alias: {
                '@shelflens/catalog': './packages/catalog/src/index.ts',
                '@jasonsdevspace/shelflens': './packages/engine/src/index.ts',
                '@shelflens/search': './packages/search/src/index.ts',
                '@shelflens/api': './packages/api/src/index.ts',
            },
            absWorkingDir: new URL('../../..', import.meta.url).pathname,
        });
        const [output] = result.outputFiles;
        expect(output).toBeDefined();
        const code = output?.text ?? '';
        expect(code).not.toContain('GraphQLError');
        expect(code).not.toContain('buildSchema');
        const compressed = gzipSync(output?.contents ?? new Uint8Array()).length;
        expect(compressed).toBeLessThan(BUDGET_BYTES);
    }, 60_000);
});
