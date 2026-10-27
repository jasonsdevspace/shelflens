import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { type PopoverBench, runPopoverBench } from './bench.js';

/**
 * Measures what the popover waits for and writes the results.
 *
 *   npm run bench:popover
 *
 * Writes the raw results as JSON and a readable report beside them.
 */
const { values } = parseArgs({
    options: {
        products: { type: 'string', default: '2000' },
        iterations: { type: 'string', default: '20' },
        out: { type: 'string', default: 'docs/benchmarks/popover.json' },
    },
});

const gitCommit = (): string => {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
};

const machine = (): string => {
    const [first] = cpus();
    return `${first?.model ?? 'unknown'}, ${cpus().length} cores`;
};

const report = (
    bench: PopoverBench,
    recorded: { date: string; commit: string; machine: string; node: string }
): string => `# Popover benchmark

Run \`npm run bench:popover\` to reproduce it. The raw results are in [popover.json](popover.json).

Results must be visible within 150 ms of the last keystroke. The search box waits 100 ms for the
typing to pause before it asks, so the API has 50 ms to answer a suggestion. These numbers are
the API answering in the same process, which is what the service worker does: the request is
real, but there is no server and no network between the page and the answer.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| ${recorded.date} | \`${recorded.commit}\` | ${recorded.machine} | ${recorded.node} |

## Starting the store

The worker does this once, when it installs: read the catalog it downloaded and build the index
and the completions from it.

| Products | Catalog (uncompressed) | Parse | Build |
| -------- | ---------------------- | ----- | ----- |
| ${bench.products} | ${(bench.catalogBytes / 1024 / 1024).toFixed(1)} MB | ${bench.parseMs} ms | ${bench.buildMs} ms |

## Answering

Every prefix of every golden query, from the second character on, as a suggestion request with
the queries and five products. And every golden query as a search for the first page with its
facets, which is what Enter asks for.

| Request | Samples | p50 | p95 | Max |
| ------- | ------- | --- | --- | --- |
| Suggest, while typing | ${bench.suggest.samples} | ${bench.suggest.p50Ms} ms | ${bench.suggest.p95Ms} ms | ${bench.suggest.maxMs} ms |
| Search, first page with facets | ${bench.search.samples} | ${bench.search.p50Ms} ms | ${bench.search.p95Ms} ms | ${bench.search.maxMs} ms |
`;

const main = async () => {
    const bench = await runPopoverBench({
        products: Number(values.products),
        iterations: Number(values.iterations),
    });
    const recorded = {
        date: new Date().toISOString().slice(0, 10),
        commit: gitCommit(),
        machine: machine(),
        node: process.version,
    };
    mkdirSync(dirname(values.out), { recursive: true });
    writeFileSync(values.out, `${JSON.stringify({ recorded, ...bench }, null, 4)}\n`);
    writeFileSync(values.out.replace(/\.json$/, '.md'), report(bench, recorded));
    console.log(
        `suggest p95 ${bench.suggest.p95Ms} ms, search p95 ${bench.search.p95Ms} ms, ` +
            `store built in ${bench.parseMs + bench.buildMs} ms`
    );
};

void main();
