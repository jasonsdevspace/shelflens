// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { generateCatalog } from '@shelflens/catalog';
import { GOLDEN_CASES } from '@shelflens/search';
import { build, type Plugin } from 'esbuild';
import { describe, expect, it } from 'vitest';

import { SOURCE_CONDITION } from '../../../source-condition.js';
import {
    BUDGET_BYTES,
    CATALOG_BUDGET_BYTES,
    FIXTURE_PROBE,
    TRY_BUDGET_BYTES,
    WIDGET_BUDGET_BYTES,
    WORKER_BUDGET_BYTES,
} from './budgets.js';

/*
 * Each download's budget, as esbuild bundles each entry on its own, and the
 * catalog's, as the generator writes it. `npm run budget` holds the files
 * the build ships to the same budgets.
 */

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
        // Each workspace package's source, by the condition its exports name.
        conditions: [SOURCE_CONDITION],
        absWorkingDir: new URL('../../..', import.meta.url).pathname,
    });
    const [output] = result.outputFiles;
    expect(output).toBeDefined();
    return {
        code: output?.text ?? '',
        compressed: gzipSync(output?.contents ?? new Uint8Array()).length,
    };
};

describe('the fixture probe', () => {
    it('is the text of one of the golden queries', () => {
        expect(GOLDEN_CASES.map((golden) => golden.because)).toContain(FIXTURE_PROBE);
    });
});

describe('the page in a browser', () => {
    it('stays within its download budget, with nothing from GraphQL or a test in it', async () => {
        const { code, compressed } = await bundled('./main.tsx');
        expect(code).not.toContain('GraphQLError');
        expect(code).not.toContain('buildSchema');
        expect(code).not.toContain(FIXTURE_PROBE);
        expect(compressed).toBeLessThan(BUDGET_BYTES);
    }, 60_000);

    it('keeps the page for a visitor’s catalog within its own budget, with nothing from GraphQL or a test', async () => {
        const { code, compressed } = await bundled('./try/main.tsx');
        expect(code).not.toContain('GraphQLError');
        expect(code).not.toContain('buildSchema');
        expect(code).not.toContain(FIXTURE_PROBE);
        expect(compressed).toBeLessThan(TRY_BUDGET_BYTES);
    }, 60_000);
});

describe('the widget in a host page', () => {
    it('stays within its own budget, with nothing from GraphQL or a test in it', async () => {
        const { code, compressed } = await bundled('./widget/index.tsx');
        expect(code).not.toContain('GraphQLError');
        expect(code).not.toContain('buildSchema');
        expect(code).not.toContain(FIXTURE_PROBE);
        expect(compressed).toBeLessThan(WIDGET_BUDGET_BYTES);
    }, 60_000);

    it('counts no visit, since the page that embeds it is someone else\u2019s site', async () => {
        const { code } = await bundled('./widget/index.tsx');
        expect(code).not.toContain('plausible.io');
    }, 60_000);
});

describe('the demo\u2019s own pages', () => {
    it('each count visits, a page added later included', async () => {
        // Every page the build serves is an index.html in the app, and each names its entry.
        const app = new URL('..', import.meta.url);
        const pages = (await readdir(app, { recursive: true })).filter(
            (path) =>
                path.endsWith('index.html') &&
                !/^(dist|node_modules|playwright-report)\//.test(path)
        );
        expect(pages.length).toBeGreaterThan(1);
        for (const page of pages) {
            const html = await readFile(new URL(page, app), 'utf8');
            const entry = /<script type="module" src="\/(src\/[^"]+)"/.exec(html)?.[1];
            expect(entry, page).toBeDefined();
            const { code } = await bundled(`../${entry ?? ''}`);
            expect(code, page).toContain('plausible.io');
        }
    }, 120_000);
});

describe('the service worker', () => {
    it('stays within its own budget, with no test fixture in it', async () => {
        const { code, compressed } = await bundled('./worker/sw.ts');
        expect(code).not.toContain(FIXTURE_PROBE);
        expect(compressed).toBeLessThan(WORKER_BUDGET_BYTES);
    }, 60_000);
});

describe('the catalog the demo ships', () => {
    it('stays within its download budget', () => {
        const compressed = gzipSync(JSON.stringify(generateCatalog())).length;
        expect(compressed).toBeLessThan(CATALOG_BUDGET_BYTES);
    });
});
