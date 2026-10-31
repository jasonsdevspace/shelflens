// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { build, type Plugin } from 'esbuild';
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

/**
 * The widget's budget. It carries the box, the client and a React of its
 * own, and React is nine tenths of it. Measured at 76 KB compressed when
 * the budget was set, by this build and by the shipped file alike.
 */
const WIDGET_BUDGET_BYTES = 85 * 1024;

/**
 * The page for a visitor's own catalog: the store's page, with the file
 * readers, the guessed mapping and the converter beside it, which no other
 * page loads. Measured at 99 KB compressed when the budget was set.
 */
const TRY_BUDGET_BYTES = 115 * 1024;

/** A stylesheet imported as text, the way Vite answers a `?inline` import. */
const inlineCss: Plugin = {
    name: 'inline-css',
    setup(build) {
        build.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
            path: resolve(args.resolveDir, args.path.replace(/\?inline$/, '')),
            namespace: 'inline-css',
        }));
        build.onLoad({ filter: /.*/, namespace: 'inline-css' }, async (args) => ({
            contents: await readFile(args.path, 'utf8'),
            loader: 'text',
        }));
    },
};

const bundled = async (entry: string) => {
    const result = await build({
        entryPoints: [new URL(entry, import.meta.url).pathname],
        bundle: true,
        platform: 'browser',
        format: 'esm',
        minify: true,
        write: false,
        logLevel: 'silent',
        jsx: 'automatic',
        loader: { '.css': 'empty' },
        plugins: [inlineCss],
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
    return {
        code: output?.text ?? '',
        compressed: gzipSync(output?.contents ?? new Uint8Array()).length,
    };
};

describe('the page in a browser', () => {
    it('stays within its download budget, with nothing from GraphQL in it', async () => {
        const { code, compressed } = await bundled('./main.tsx');
        expect(code).not.toContain('GraphQLError');
        expect(code).not.toContain('buildSchema');
        expect(compressed).toBeLessThan(BUDGET_BYTES);
    }, 60_000);

    it('keeps the page for a visitor’s catalog within its own budget, with nothing from GraphQL', async () => {
        const { code, compressed } = await bundled('./try/main.tsx');
        expect(code).not.toContain('GraphQLError');
        expect(code).not.toContain('buildSchema');
        expect(compressed).toBeLessThan(TRY_BUDGET_BYTES);
    }, 60_000);
});

describe('the widget in a host page', () => {
    it('stays within its own budget, with nothing from GraphQL in it', async () => {
        const { code, compressed } = await bundled('./widget/index.tsx');
        expect(code).not.toContain('GraphQLError');
        expect(code).not.toContain('buildSchema');
        expect(compressed).toBeLessThan(WIDGET_BUDGET_BYTES);
    }, 60_000);
});
