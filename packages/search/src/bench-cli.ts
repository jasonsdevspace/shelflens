import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { type BenchResult, runBench } from './bench.js';

/**
 * Runs the engine benchmark and writes its results.
 *
 *   npm run bench
 *   npm run bench -- --products 250000 --iterations 50
 *
 * Writes the raw results as JSON and a readable report beside them.
 */
const { values } = parseArgs({
    options: {
        products: { type: 'string', default: '100000' },
        seed: { type: 'string', default: '7' },
        iterations: { type: 'string', default: '100' },
        out: { type: 'string', default: 'docs/benchmarks/results.json' },
    },
});

const gitCommit = (): string => {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
};

interface Report extends BenchResult {
    readonly recordedAt: string;
    readonly commit: string;
    readonly environment: { readonly node: string; readonly cpu: string; readonly cores: number };
    readonly iterations: number;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const render = (report: Report): string => `# Engine benchmark

Run \`npm run bench\` to reproduce it. The raw results are in [results.json](results.json). Absolute
numbers depend on the machine, so what carries over is the shape: what grows with the catalog, and
what does not.

| Recorded | Commit | Machine | Node |
| --- | --- | --- | --- |
| ${report.recordedAt.slice(0, 10)} | \`${report.commit}\` | ${report.environment.cpu}, ${report.environment.cores} cores | ${report.environment.node} |

## The catalog

${report.catalog.products.toLocaleString('en-US')} generated products from seed ${report.catalog.seed}: ${mb(report.catalog.jsonBytes)} as JSON, ${mb(report.catalog.gzipBytes)} compressed.

## Building the index

| Terms | Build time | Documents per second | Heap used |
| --- | --- | --- | --- |
| ${report.index.terms.toLocaleString('en-US')} | ${report.index.buildMs} ms | ${report.index.documentsPerSecond.toLocaleString('en-US')} | ${report.index.heapMb} MB |

## Queries

Each query runs as a guest with every facet counted, ${report.iterations} times after a warm-up.
Times are milliseconds per search.

The generated catalog has a small vocabulary, so the fuzzy pass, which compares the query against
every indexed term of a similar length, costs far less here than it would on a real catalog with
tens of thousands of distinct words. The other costs, which grow with the number of products
rather than of words, carry over.

| Query | Results | p50 | p95 | p99 |
| --- | --- | --- | --- | --- |
${report.queries.map((q) => `| ${q.name} | ${q.total.toLocaleString('en-US')} | ${q.p50} | ${q.p95} | ${q.p99} |`).join('\n')}
`;

const report: Report = {
    recordedAt: new Date().toISOString(),
    commit: gitCommit(),
    environment: {
        node: process.version,
        cpu: cpus()[0]?.model ?? 'unknown',
        cores: cpus().length,
    },
    iterations: Number(values.iterations),
    ...runBench({
        products: Number(values.products),
        seed: Number(values.seed),
        iterations: Number(values.iterations),
    }),
};

mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify(report, null, 4)}\n`);
writeFileSync(values.out.replace(/\.json$/, '.md'), render(report));
for (const query of report.queries) {
    console.error(
        `${query.name}: p50 ${query.p50} ms, p99 ${query.p99} ms, ${query.total} results`
    );
}
console.error(`index: ${report.index.buildMs} ms, ${report.index.heapMb} MB; wrote ${values.out}`);
