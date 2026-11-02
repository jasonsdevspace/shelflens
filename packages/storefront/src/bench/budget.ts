import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { BUDGET_BYTES, TRY_BUDGET_BYTES, WIDGET_BUDGET_BYTES } from '../budgets.js';

/**
 * The download budgets, held over the files the build ships.
 *
 *   npm run budget
 *
 * Runs after `npm run storefront`. Each page's scripts are the ones its
 * HTML loads or preloads, each compressed as a server sends it, and the
 * widget is the one file a host page loads. A page past its budget, or
 * with anything from GraphQL in it, fails the run. The test beside the
 * budgets measures each entry as esbuild bundles it, which catches a
 * change in the source before anything is built.
 */

const DIST = new URL('../../dist/', import.meta.url);

/** The scripts a built page loads at once: its entry and what it preloads. */
const scriptsOf = (page: string): readonly string[] => {
    const html = readFileSync(new URL(page, DIST), 'utf8');
    const found = [
        ...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g),
        ...html.matchAll(/<link rel="modulepreload"[^>]*\shref="([^"]+\.js)"/g),
    ].map((match) => match[1] ?? '');
    // Served under the site's base, which the build may have set, so the path is
    // read from the assets folder down.
    return [...new Set(found)].map((src) => src.slice(src.indexOf('assets/')));
};

const SHIPPED: readonly {
    readonly what: string;
    readonly files: readonly string[];
    readonly budget: number;
}[] = [
    { what: 'the page', files: scriptsOf('index.html'), budget: BUDGET_BYTES },
    {
        what: 'the page for a visitor’s catalog',
        files: scriptsOf('try/index.html'),
        budget: TRY_BUDGET_BYTES,
    },
    { what: 'the widget', files: ['widget.js'], budget: WIDGET_BUDGET_BYTES },
];

const failures: string[] = [];
for (const { what, files, budget } of SHIPPED) {
    if (files.length === 0) failures.push(`${what} loads no script the build wrote`);
    let compressed = 0;
    for (const file of files) {
        const code = readFileSync(new URL(file, DIST));
        compressed += gzipSync(code).length;
        const text = code.toString('utf8');
        if (text.includes('GraphQLError') || text.includes('buildSchema')) {
            failures.push(`${what} carries GraphQL in ${file}`);
        }
    }
    const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
    console.log(`${what}: ${kb(compressed)} of ${kb(budget)}, in ${files.join(', ')}`);
    if (compressed >= budget) failures.push(`${what} is ${kb(compressed)}, past ${kb(budget)}`);
}

if (failures.length > 0) {
    console.error(`Past the budget: ${failures.join('. ')}.`);
    process.exit(1);
}
