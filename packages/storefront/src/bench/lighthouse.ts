import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

import { PAGES } from './pages.js';
import { startPreview } from './preview.js';

/**
 * Lighthouse over the built demo, in two passes.
 *
 *   npm run lighthouse
 *
 * Runs after `npm run storefront` has built the page.
 *
 * Accessibility is audited on each page as it is once ready. One visit
 * first installs the worker and waits for the page, and the audit keeps
 * that storage, so what Lighthouse reads is the storefront, not its
 * loading state. The page for a visitor's own catalog is audited empty, as
 * a visitor first finds it, and with the sample file loaded through the
 * page, searching in explain mode. Every page must score a hundred.
 *
 * Performance is measured on a first visit, as a phone on a slow network
 * makes it: Lighthouse clears the site's storage before each page, so the
 * worker installs, the catalog downloads and the store builds while it
 * watches. Every page must score at least ninety, paint its largest content
 * within the time a visit counts as good, and shift its layout no more than
 * that either. One trace on a shared machine can be slow for reasons of its
 * own, so a page that misses is measured twice more and judged on the
 * middle of the three. The bytes of script each page carries are held to
 * their budgets by `npm run budget`, over the same build.
 */

const PORT = 4176;

/** The lowest performance score a page may have. */
const PERFORMANCE = 0.9;
/** The largest paint, in milliseconds, within which a visit counts as good. */
const LARGEST_PAINT_MS = 2500;
/** The layout shift past which a visit no longer counts as good. */
const LAYOUT_SHIFT = 0.1;
/** How many traces a page that misses is judged on. */
const TRACES = 3;

type Report = NonNullable<Awaited<ReturnType<typeof lighthouse>>>['lhr'];

interface Measure {
    readonly performance: number;
    readonly paint: number;
    readonly shift: number;
}

const measureOf = (report: Report): Measure => ({
    performance: report.categories.performance?.score ?? 0,
    paint: report.audits['largest-contentful-paint']?.numericValue ?? Number.POSITIVE_INFINITY,
    shift: report.audits['cumulative-layout-shift']?.numericValue ?? Number.POSITIVE_INFINITY,
});

/** Each figure's middle value across the traces, so one slow trace does not decide. */
const middle = (measures: readonly Measure[]): Measure => {
    const of = (pick: (measure: Measure) => number) => {
        const sorted = measures.map(pick).sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
    };
    return {
        performance: of((m) => m.performance),
        paint: of((m) => m.paint),
        shift: of((m) => m.shift),
    };
};

/** What a measure misses of the gate, each in a few words, or nothing when it passes. */
const missed = ({ performance, paint, shift }: Measure): readonly string[] => [
    ...(performance < PERFORMANCE ? [`performance ${String(Math.round(performance * 100))}`] : []),
    ...(paint > LARGEST_PAINT_MS ? [`largest paint ${String(Math.round(paint))} ms`] : []),
    ...(shift > LAYOUT_SHIFT ? [`layout shift ${shift.toFixed(3)}`] : []),
];

const describe = ({ performance, paint, shift }: Measure): string =>
    `performance ${String(Math.round(performance * 100))}, largest paint ${String(Math.round(paint))} ms, layout shift ${shift.toFixed(3)}`;

/** The accessibility audits that did not pass, named, so a failure says what to fix. */
const findingsOf = (report: Report): readonly string[] =>
    (report.categories.accessibility?.auditRefs ?? []).flatMap((ref) => {
        const audit = report.audits[ref.id];
        return audit?.score !== null && audit !== undefined && audit.score < 1 ? [audit.id] : [];
    });

type Run = (url: string, category: string, keepStorage: boolean) => Promise<Report>;

/** The first pass: accessibility, on each page as it is once ready. What fails is added to `failures`. */
const auditAccessibility = async (
    port: number,
    origin: string,
    run: Run,
    failures: string[]
): Promise<void> => {
    const browser = await chromium.connectOverCDP(`http://localhost:${String(port)}`);
    const page = await browser.newPage();
    for (const { path, prepare, ready } of PAGES) {
        if (prepare) await prepare(page, origin);
        await page.goto(`${origin}${path}`);
        if (ready) await ready(page);
        const report = await run(`${origin}${path}`, 'accessibility', true);
        const score = Math.round((report.categories.accessibility?.score ?? 0) * 100);
        const findings = findingsOf(report);
        const detail = findings.length > 0 ? `, ${findings.join(', ')}` : '';
        console.log(`${path}: accessibility ${String(score)}${detail}`);
        if (score < 100) failures.push(`${path} (accessibility ${String(score)})`);
    }
    await browser.close();
};

/** The second pass: performance, on a first visit to each page. What fails is added to `failures`. */
const measurePerformance = async (origin: string, run: Run, failures: string[]): Promise<void> => {
    for (const { path } of PAGES) {
        const url = `${origin}${path}`;
        const measures = [measureOf(await run(url, 'performance', false))];
        while (missed(middle(measures)).length > 0 && measures.length < TRACES) {
            measures.push(measureOf(await run(url, 'performance', false)));
        }
        const judged = middle(measures);
        const traces = measures.length > 1 ? `, the middle of ${String(measures.length)}` : '';
        console.log(`${path} on a first visit: ${describe(judged)}${traces}`);
        const misses = missed(judged);
        if (misses.length > 0) failures.push(`${path} (${misses.join(', ')})`);
    }
};

const main = async () => {
    const preview = await startPreview(PORT);
    const chrome = await launch({
        chromePath: chromium.executablePath(),
        chromeFlags: ['--headless=new', '--no-sandbox'],
    });
    const run: Run = async (url, category, keepStorage) => {
        const result = await lighthouse(url, {
            port: chrome.port,
            onlyCategories: [category],
            output: 'json',
            logLevel: 'error',
            disableStorageReset: keepStorage,
        });
        if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
        return result.lhr;
    };
    const failures: string[] = [];
    try {
        await auditAccessibility(chrome.port, preview.origin, run, failures);
        await measurePerformance(preview.origin, run, failures);
    } finally {
        preview.stop();
        try {
            chrome.kill();
        } catch {
            // Chrome was already gone, and the preview is stopped either way.
        }
    }
    if (failures.length > 0) {
        throw new Error(`short of the gate: ${failures.join(', ')}`);
    }
};

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
