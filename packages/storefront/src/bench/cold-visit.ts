import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { chromium } from '@playwright/test';

import { CATALOG_ROW_CAP } from '../try/limits.js';
import { sampleCsv } from '../try/sample.js';
import type { StartedMessage } from '../worker/handle.js';
import { startPreview } from './preview.js';
import { gitCommit, today } from './record.js';
import { PHONE_SLOWDOWN } from './sizes.js';

/**
 * Measures a cold first visit to the built demo, as a shopper has it.
 *
 *   npm run bench:cold
 *
 * Each run is a fresh browser context: no worker, no cache, no catalog.
 * It records when the page was ready to search, how long the worker spent
 * downloading the catalog and building the store, and how long the first
 * suggestion took after typing. Writes the raw results as JSON and a
 * readable report beside them.
 *
 * Then the same for a visitor's own catalog at the cap: a file of that
 * many products loaded at try/ as a visitor loads it, timed from picking
 * it to the review, from pressing search to the store answering, and to
 * the first suggestion. Once as the laptop runs it, and once with the
 * processor slowed four times, as Lighthouse slows it for a phone, since
 * the cap was chosen for a phone to start its store within two seconds.
 */

const PORT = 4175;
const RUNS = Number(process.env.RUNS ?? 5);
const CAP_RUNS = Number(process.env.CAP_RUNS ?? 3);
const OUT = 'docs/benchmarks/cold-visit';

interface Run {
    readonly readyMs: number;
    readonly downloadMs: number;
    readonly buildMs: number;
    readonly firstSuggestionMs: number;
}

interface Marks {
    started?: StartedMessage;
}

const visit = async (origin: string): Promise<Run> => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    // Listen for the worker before the page registers it, so the message is not missed.
    await page.addInitScript(() => {
        const marks: Marks = {};
        (window as unknown as { marks: Marks }).marks = marks;
        navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
            const data = event.data as { type?: unknown };
            if (data.type === 'shelflens:started') marks.started = data as StartedMessage;
        });
    });
    await page.goto(`${origin}/`);
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.waitFor();
    const readyMs = await page.evaluate(() => performance.now());

    const typedAt = await page.evaluate(() => performance.now());
    await search.fill('trail');
    // The listbox can appear before it has anything in it. A suggestion is the answer.
    await page.getByRole('option').first().waitFor();
    const shownAt = await page.evaluate(() => performance.now());
    const { started } = await page.evaluate(() => (window as unknown as { marks: Marks }).marks);
    await browser.close();
    if (!started) throw new Error('the worker never said how the store started');
    return {
        readyMs,
        downloadMs: started.downloadMs,
        buildMs: started.buildMs,
        firstSuggestionMs: shownAt - typedAt,
    };
};

interface CapRun {
    /** Reading the file, guessing the mapping and making the catalog, in the page. */
    readonly readMs: number;
    /** From pressing search to the store answering: the catalog sent, checked and built. */
    readonly buildMs: number;
    /** The worker's share of that: reading the catalog, checking it and building the store. */
    readonly workerMs: number;
    readonly firstSuggestionMs: number;
}

/** The worker's own timing of a catalog load, from the Server-Timing header it answers with. */
const workerShare = (header: string | undefined): number =>
    Number(/catalog;dur=([\d.]+)/.exec(header ?? '')?.[1] ?? Number.NaN);

/** A visitor's catalog at the cap, loaded and searched in a fresh browser. */
const capVisit = async (origin: string, file: string, slowdown: number): Promise<CapRun> => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    if (slowdown > 1) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
    }
    const now = () => page.evaluate(() => performance.now());
    await page.goto(`${origin}/try/`);
    await page.getByRole('heading', { level: 1, name: 'Search your own products' }).waitFor();
    const pickedAt = await now();
    await page.getByLabel('Choose a file').setInputFiles(file);
    const search = page.getByRole('button', { name: /^Search [\d,]+ products$/ });
    await search.waitFor({ timeout: 120_000 });
    const reviewedAt = await now();
    const loaded = page.waitForResponse(
        (response) =>
            response.url().endsWith('/try/catalog') && response.request().method() === 'PUT',
        { timeout: 120_000 }
    );
    await search.click();
    const workerMs = workerShare((await loaded).headers()['server-timing']);
    const box = page.getByRole('combobox', { name: 'Search the store' });
    await box.waitFor({ timeout: 120_000 });
    const readyAt = await now();
    await box.fill('bag');
    await page.getByRole('option').first().waitFor({ timeout: 60_000 });
    const shownAt = await now();
    await browser.close();
    return {
        readMs: reviewedAt - pickedAt,
        buildMs: readyAt - reviewedAt,
        workerMs,
        firstSuggestionMs: shownAt - readyAt,
    };
};

const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const ms = (value: number): string => `${value.toFixed(0)} ms`;
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} KB`;

const report = (
    runs: readonly Run[],
    sizes: { catalog: number; page: number; worker: number },
    recorded: { date: string; commit: string }
): string => `# Cold first visit

Run \`npm run bench:cold\` to reproduce it. The raw results are in [cold-visit.json](cold-visit.json).

A first visit with nothing cached: the page downloads, registers the worker, the worker
downloads the catalog and the rules and builds the store, claims the page, and the shopper can
search. Each run is a fresh browser context against the production build served locally, so the
numbers leave out the network and show what the browser itself has to do.

| Recorded | Commit | Catalog (gzip) | Page (gzip) | Worker (gzip) |
| -------- | ------ | -------------- | ----------- | ------------- |
| ${recorded.date} | \`${recorded.commit}\` | ${kb(sizes.catalog)} | ${kb(sizes.page)} | ${kb(sizes.worker)} |

| Run | Ready to search | Catalog and rules downloaded | Store built | First suggestion |
| --- | --------------- | ---------------------------- | ----------- | ---------------- |
${runs
    .map(
        (run, i) =>
            `| ${i + 1} | ${ms(run.readyMs)} | ${ms(run.downloadMs)} | ${ms(run.buildMs)} | ${ms(run.firstSuggestionMs)} |`
    )
    .join('\n')}
| Median | ${ms(median(runs.map((r) => r.readyMs)))} | ${ms(median(runs.map((r) => r.downloadMs)))} | ${ms(median(runs.map((r) => r.buildMs)))} | ${ms(median(runs.map((r) => r.firstSuggestionMs)))} |

"Ready to search" is measured from the start of navigation to the search box appearing, which
happens once the worker has claimed the page. The worker reports its own two timings. The first
suggestion is measured from typing to the first suggestion appearing, and includes the popover's
pause for the typing to stop.
`;

/**
 * The wait on a phone. The browser slows the page but cannot slow the worker,
 * so the worker's share is measured as it ran and scaled here.
 */
const phoneWait = (run: CapRun): number => run.buildMs + run.workerMs * (PHONE_SLOWDOWN - 1);

const capRows = (label: string, runs: readonly CapRun[], phone: boolean): string => {
    const row = (name: string, run: CapRun & { readonly waitMs: number }) =>
        `| ${name} | ${ms(run.readMs)} | ${ms(run.buildMs)} | ${ms(run.workerMs)} | ${phone ? ms(run.waitMs) : 'as measured'} | ${ms(run.firstSuggestionMs)} |`;
    const middle = {
        readMs: median(runs.map((r) => r.readMs)),
        buildMs: median(runs.map((r) => r.buildMs)),
        workerMs: median(runs.map((r) => r.workerMs)),
        waitMs: median(runs.map(phoneWait)),
        firstSuggestionMs: median(runs.map((r) => r.firstSuggestionMs)),
    };
    return [
        ...runs.map((run, i) => row(`${label} ${i + 1}`, { ...run, waitMs: phoneWait(run) })),
        row(`${label}, median`, middle),
    ].join('\n');
};

const capReport = (
    laptop: readonly CapRun[],
    phone: readonly CapRun[],
    fileBytes: number
): string => `
## A visitor's catalog at the cap

The page at \`try/\` with a file of ${CATALOG_ROW_CAP.toLocaleString('en-US')} products, the cap,
written as the sample is and ${(fileBytes / 1024 / 1024).toFixed(1)} MB as a CSV. Each run is a fresh
browser: the file is picked, read and mapped in the page, then search is pressed and the catalog
goes to the page's own worker, which checks it and builds the store. "Laptop" is the machine as
it is. "Phone" slows the processor four times, as Lighthouse slows it for mobile, but a browser
can slow only the page and not its worker, so the worker times its own share and the wait on a
phone scales that share too. The cap was chosen for a phone to start its store within two
seconds, and that column is the wait.

| Run | Reading the file | Pressing search to searching | The worker's share | Wait on a phone | First suggestion |
| --- | ---------------- | ---------------------------- | ------------------ | --------------- | ---------------- |
${capRows('Laptop', laptop, false)}
${capRows('Phone', phone, true)}

"Reading the file" is from picking it to the review being ready, and includes guessing the
mapping and making the whole catalog. "Pressing search to searching" includes sending the
catalog to the worker, its check, the build and the store's first page, as measured, with the
worker at full speed. The worker's share is reading the catalog it was sent, checking it and
building the store. The first suggestion includes the popover's pause for the typing to stop,
and on a phone its answer from the worker is not slowed either.
`;

const gzipped = (path: string): number => gzipSync(readFileSync(path)).length;

const main = async () => {
    const preview = await startPreview(PORT);
    try {
        const runs: Run[] = [];
        for (let i = 0; i < RUNS; i += 1) runs.push(await visit(preview.origin));
        const dist = 'packages/storefront/dist';
        // The store's own bundle, beside the explainer's and whatever the build shares.
        const pageFile = readdirSync(`${dist}/assets`).find(
            (name) => name.startsWith('main-') && name.endsWith('.js')
        );
        const sizes = {
            catalog: gzipped(`${dist}/catalog.json`),
            page: pageFile ? gzipped(`${dist}/assets/${pageFile}`) : 0,
            worker: gzipped(`${dist}/sw.js`),
        };
        const folder = mkdtempSync(join(tmpdir(), 'shelflens-cap-'));
        const file = join(folder, 'at-the-cap.csv');
        writeFileSync(file, sampleCsv(CATALOG_ROW_CAP));
        const fileBytes = readFileSync(file).length;
        const atCap = { laptop: [] as CapRun[], phone: [] as CapRun[] };
        try {
            for (let i = 0; i < CAP_RUNS; i += 1) {
                atCap.laptop.push(await capVisit(preview.origin, file, 1));
                atCap.phone.push(await capVisit(preview.origin, file, PHONE_SLOWDOWN));
            }
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
        const recorded = { date: today(), commit: gitCommit() };
        const text =
            report(runs, sizes, recorded) + capReport(atCap.laptop, atCap.phone, fileBytes);
        writeFileSync(
            `${OUT}.json`,
            `${JSON.stringify({ recorded, sizes, runs, atCap }, null, 2)}\n`
        );
        writeFileSync(`${OUT}.md`, text);
        console.log(text);
    } finally {
        preview.stop();
    }
};

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
