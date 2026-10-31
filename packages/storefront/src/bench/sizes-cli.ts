import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { gitCommit, machine, megabytes, round, today } from './record.js';
import {
    fitsOnAPhone,
    PHONE_SLOWDOWN,
    runSizes,
    type SizeResult,
    START_BUDGET_MS,
    startMs,
    SUGGEST_BUDGET_MS,
    supportedCap,
} from './sizes.js';

/**
 * Measures the popover at each catalog size and writes the results.
 *
 *   npm run bench:sizes
 *
 * Writes the raw results as JSON and a readable report beside them. The cap
 * a visitor's catalog is held to is checked against the JSON by a test.
 */
const { values } = parseArgs({
    options: {
        iterations: { type: 'string', default: '20' },
        out: { type: 'string', default: 'docs/benchmarks/catalog-size.json' },
    },
});

const row = (result: SizeResult): string =>
    `| ${result.products} | ${megabytes(result.catalogBytes)} | ${startMs(result)} ms | ` +
    `${slowed(startMs(result))} | ${result.suggest.p95Ms} ms | ${slowed(result.suggest.p95Ms)} | ` +
    `${result.search.p95Ms} ms | ${slowed(result.search.p95Ms)} | ` +
    `${fitsOnAPhone(result) ? 'yes' : 'no'} |`;

const report = (
    results: readonly SizeResult[],
    recorded: { date: string; commit: string; machine: string; node: string }
): string => `# Catalog size benchmark

Run \`npm run bench:sizes\` to reproduce it. The raw results are in
[catalog-size.json](catalog-size.json).

A visitor can search their own catalog, and this says how large it can be. Each size is the
[popover benchmark](popover.md) run over a generated catalog of that many products: starting the
store once, then every prefix of every golden query as a suggestion and every golden query as a
search. A visitor may be on a phone, so each time is slowed ${PHONE_SLOWDOWN} times, as
Lighthouse slows the processor for mobile. A size fits when, slowed, suggestions and searches
answer within ${SUGGEST_BUDGET_MS} ms at the 95th percentile and the store starts within
${START_BUDGET_MS / 1000} seconds, the one wait after loading a file.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| ${recorded.date} | \`${recorded.commit}\` | ${recorded.machine} | ${recorded.node} |

Each time is shown as measured on the laptop and then slowed for a phone, which is the number held
to the budget.

| Products | Catalog (uncompressed) | Start | On a phone | Suggest p95 | On a phone | Search p95 | On a phone | Fits a phone |
| -------- | ---------------------- | ----- | ---------- | ----------- | ---------- | ---------- | ---------- | ------------ |
${results.map(row).join('\n')}

The largest size that fits, with every smaller one fitting too, is ${supportedCap(results)} products,
and that is the cap on a visitor's catalog.
`;

const iterations = Number(values.iterations);
if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(`--iterations has to be a whole number above zero, not ${values.iterations}`);
}
if (!values.out.endsWith('.json')) {
    throw new Error(
        `--out has to name a .json file, so the report beside it has a name of its own`
    );
}

const slowed = (ms: number): string => `${round(ms * PHONE_SLOWDOWN)} ms`;

const main = async () => {
    const results = await runSizes(iterations);
    const recorded = {
        date: today(),
        commit: gitCommit(),
        machine: machine(),
        node: process.version,
    };
    mkdirSync(dirname(values.out), { recursive: true });
    writeFileSync(values.out, `${JSON.stringify({ recorded, results }, null, 4)}\n`);
    writeFileSync(values.out.replace(/\.json$/, '.md'), report(results, recorded));
    console.log(`supported cap ${supportedCap(results)} products`);
};

void main();
