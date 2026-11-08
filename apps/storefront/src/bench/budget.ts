import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { budgetSummary, kb, writeSummary } from '../../../../scripts/summary.mjs';
import {
    BUDGET_BYTES,
    CATALOG_BUDGET_BYTES,
    FIXTURE_PROBE,
    TRY_BUDGET_BYTES,
    WIDGET_BUDGET_BYTES,
    WORKER_BUDGET_BYTES,
} from '../budgets.js';

/**
 * The download budgets, held over the files the build ships.
 *
 *   npm run budget
 *
 * Runs after `npm run storefront`. A page is the scripts its HTML loads or
 * preloads, which is what it needs before it can answer. A chunk it imports
 * later, on demand, is not part of it, and its stylesheets are measured by
 * Lighthouse with the page. The widget is the one file a host page loads, the
 * service worker the one file the browser installs, and the catalog the file
 * the store's first visit indexes. Each is compressed as a server sends it. A
 * file past its budget, or with anything from GraphQL in it, fails the run, and
 * so does any file that carries the golden queries, the tests' own fixture. The
 * worker carries GraphQL by design. The test beside the budgets measures each
 * entry as esbuild bundles it, and the catalog as the generator writes it,
 * which catches a change in the source before anything is built.
 */

const DIST = new URL('../../dist/', import.meta.url);

if (!existsSync(DIST)) {
    console.error('Nothing is built to measure. Run `npm run storefront` first.');
    process.exit(1);
}

/** The scripts a built page loads at once: its entry and what it preloads. */
const scriptsOf = (page: string): readonly string[] => {
    const html = readFileSync(new URL(page, DIST), 'utf8');
    const found = [
        ...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g),
        ...html.matchAll(/<link rel="modulepreload"[^>]*\shref="([^"]+\.js)"/g),
    ].map((match) => match[1] ?? '');
    // Served under the site's base, which the build may have set, so the path is
    // read from the assets folder down. A script from anywhere else is one this
    // check does not know how to measure, and says so.
    return [...new Set(found)].map((src) => {
        const at = src.indexOf('assets/');
        if (at === -1) throw new Error(`${page} loads ${src}, which is not among the built assets`);
        return src.slice(at);
    });
};

const SHIPPED: readonly {
    readonly what: string;
    readonly files: readonly string[];
    readonly budget: number;
    /** Whether GraphQL may be in it, which only the worker needs. */
    readonly graphql?: true;
}[] = [
    { what: 'the page', files: scriptsOf('index.html'), budget: BUDGET_BYTES },
    {
        what: 'the page for a visitor’s catalog',
        files: scriptsOf('try/index.html'),
        budget: TRY_BUDGET_BYTES,
    },
    { what: 'the widget', files: ['widget.js'], budget: WIDGET_BUDGET_BYTES },
    { what: 'the service worker', files: ['sw.js'], budget: WORKER_BUDGET_BYTES, graphql: true },
    { what: 'the catalog', files: ['catalog.json'], budget: CATALOG_BUDGET_BYTES },
];

const failures: string[] = [];
// Each part as it was measured, for the run's summary.
const parts: Parameters<typeof budgetSummary>[0][number][] = [];
for (const { what, files, budget, graphql } of SHIPPED) {
    const before = failures.length;
    if (files.length === 0) failures.push(`${what} loads no script the build wrote`);
    let compressed = 0;
    for (const file of files) {
        const code = readFileSync(new URL(file, DIST));
        compressed += gzipSync(code).length;
        const text = code.toString('utf8');
        if (!graphql && (text.includes('GraphQLError') || text.includes('buildSchema'))) {
            failures.push(`${what} carries GraphQL in ${file}`);
        }
        if (text.includes(FIXTURE_PROBE))
            failures.push(`${what} carries the golden queries in ${file}`);
    }
    console.log(`${what}: ${kb(compressed)} of ${kb(budget)}, in ${files.join(', ')}`);
    if (compressed >= budget) failures.push(`${what} is ${kb(compressed)}, past ${kb(budget)}`);
    parts.push({
        what,
        size: compressed,
        budget,
        problems: failures.slice(before).map((failure) => failure.replace(`${what} `, '')),
    });
}
writeSummary(budgetSummary(parts));

if (failures.length > 0) {
    console.error(`Past the budget: ${failures.join('. ')}.`);
    process.exit(1);
}
