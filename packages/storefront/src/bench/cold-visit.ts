import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { chromium } from '@playwright/test';

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
 */

const PORT = 4175;
const ORIGIN = `http://localhost:${PORT}`;
const RUNS = Number(process.env.RUNS ?? 5);
const OUT = 'docs/benchmarks/cold-visit';

interface Run {
    readonly readyMs: number;
    readonly downloadMs: number;
    readonly buildMs: number;
    readonly firstSuggestionMs: number;
}

const startPreview = (): Promise<ChildProcess> =>
    new Promise((resolve, reject) => {
        const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
            cwd: 'packages/storefront',
            stdio: ['ignore', 'pipe', 'inherit'],
        });
        child.stdout.on('data', (chunk: Buffer) => {
            if (chunk.toString().includes(String(PORT))) resolve(child);
        });
        child.on('exit', (code) => reject(new Error(`the preview exited with ${code}`)));
    });

const visit = async (): Promise<Run> => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    // Listen for the worker before the page registers it, so the message is not missed.
    await page.addInitScript(() => {
        const marks: Record<string, number> = {};
        (window as unknown as { marks: Record<string, number> }).marks = marks;
        navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
            const data = event.data as { type?: string; downloadMs?: number; buildMs?: number };
            if (data.type === 'shelflens:started') {
                marks.downloadMs = data.downloadMs ?? 0;
                marks.buildMs = data.buildMs ?? 0;
            }
        });
    });
    await page.goto(`${ORIGIN}/`);
    const search = page.getByRole('combobox', { name: 'Search the store' });
    await search.waitFor();
    const readyMs = await page.evaluate(() => performance.now());

    const typedAt = await page.evaluate(() => performance.now());
    await search.fill('trail');
    await page.getByRole('listbox', { name: 'Suggestions' }).waitFor();
    const shownAt = await page.evaluate(() => performance.now());
    const marks = await page.evaluate(
        () => (window as unknown as { marks: Record<string, number> }).marks
    );
    await browser.close();
    return {
        readyMs,
        downloadMs: marks.downloadMs ?? 0,
        buildMs: marks.buildMs ?? 0,
        firstSuggestionMs: shownAt - typedAt,
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
suggestion is measured from typing to the suggestions appearing, and includes the popover's
pause for the typing to stop.
`;

const gzipped = (path: string): number => gzipSync(readFileSync(path)).length;

const main = async () => {
    const preview = await startPreview();
    try {
        const runs: Run[] = [];
        for (let i = 0; i < RUNS; i += 1) runs.push(await visit());
        const dist = 'packages/storefront/dist';
        const assets = execFileSync('ls', [`${dist}/assets`], { encoding: 'utf8' }).split('\n');
        const pageFile = assets.find((name) => name.endsWith('.js')) ?? '';
        const sizes = {
            catalog: gzipped(`${dist}/catalog.json`),
            page: pageFile ? gzipped(`${dist}/assets/${pageFile}`) : 0,
            worker: gzipped(`${dist}/sw.js`),
        };
        const recorded = {
            date: new Date().toISOString().slice(0, 10),
            commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
                encoding: 'utf8',
            }).trim(),
        };
        writeFileSync(`${OUT}.json`, `${JSON.stringify({ recorded, sizes, runs }, null, 2)}\n`);
        writeFileSync(`${OUT}.md`, report(runs, sizes, recorded));
        console.log(report(runs, sizes, recorded));
    } finally {
        preview.kill();
    }
};

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
