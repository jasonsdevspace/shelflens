import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

import { PAGES } from './pages.js';
import { startPreview } from './preview.js';

/**
 * Lighthouse over the built demo, as a phone on a slow network loads it.
 * Every page it checks must score a hundred for accessibility and at least
 * ninety for performance, paint its largest content within the time a
 * visit counts as good, and shift its layout no more than that either.
 * The bytes of script each page carries are held to their budgets by
 * `npm run budget`, over the same build.
 *
 *   npm run lighthouse
 *
 * Runs after `npm run storefront` has built the page. One visit first
 * installs the worker and waits for the page to be ready, and the audits
 * keep that storage, so each page Lighthouse loads is answered by a
 * worker already in charge and is the storefront, not its loading state.
 * Each page is checked to be ready before it is audited.
 *
 * The page for a visitor's own catalog is audited twice: empty, as a visitor
 * first finds it, and with the sample file loaded through the page, as a
 * visitor loads one, searching in explain mode.
 */

const PORT = 4176;

/** The lowest performance score a page may have. */
const PERFORMANCE = 0.9;
/** The largest paint, in milliseconds, within which a visit counts as good. */
const LARGEST_PAINT_MS = 2500;
/** The layout shift past which a visit no longer counts as good. */
const LAYOUT_SHIFT = 0.1;

type Report = NonNullable<Awaited<ReturnType<typeof lighthouse>>>['lhr'];

/** A page's scores and measures in one line, with the accessibility audits that did not pass. */
const summary = (report: Report): string => {
    const audits = report.audits;
    const score = (name: string) => Math.round((report.categories[name]?.score ?? 0) * 100);
    const paint = Math.round(audits['largest-contentful-paint']?.numericValue ?? 0);
    const shift = (audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3);
    const findings = (report.categories.accessibility?.auditRefs ?? []).flatMap((ref) => {
        const audit = audits[ref.id];
        return audit?.score !== null && audit !== undefined && audit.score < 1 ? [audit.id] : [];
    });
    const detail = findings.length > 0 ? `, ${findings.join(', ')}` : '';
    return `accessibility ${String(score('accessibility'))}, performance ${String(score('performance'))}, largest paint ${String(paint)} ms, layout shift ${shift}${detail}`;
};

/** What a page misses of the gate, each in a few words, or nothing when it passes. */
const missed = (report: Report): readonly string[] => {
    const value = (id: string) => report.audits[id]?.numericValue ?? Number.POSITIVE_INFINITY;
    const accessibility = report.categories.accessibility?.score ?? 0;
    const performance = report.categories.performance?.score ?? 0;
    return [
        ...(accessibility < 1 ? [`accessibility ${String(Math.round(accessibility * 100))}`] : []),
        ...(performance < PERFORMANCE
            ? [`performance ${String(Math.round(performance * 100))}`]
            : []),
        ...(value('largest-contentful-paint') > LARGEST_PAINT_MS ? ['largest paint'] : []),
        ...(value('cumulative-layout-shift') > LAYOUT_SHIFT ? ['layout shift'] : []),
    ];
};
const main = async () => {
    const preview = await startPreview(PORT);
    const chrome = await launch({
        chromePath: chromium.executablePath(),
        chromeFlags: ['--headless=new', '--no-sandbox'],
    });
    const failures: string[] = [];
    try {
        const browser = await chromium.connectOverCDP(`http://localhost:${chrome.port}`);
        const page = await browser.newPage();
        for (const { path, prepare, ready } of PAGES) {
            if (prepare) await prepare(page, preview.origin);
            await page.goto(`${preview.origin}${path}`);
            if (ready) await ready(page);
            const result = await lighthouse(`${preview.origin}${path}`, {
                port: chrome.port,
                onlyCategories: ['accessibility', 'performance'],
                output: 'json',
                logLevel: 'error',
                disableStorageReset: true,
            });
            if (!result) throw new Error(`Lighthouse returned nothing for ${path}`);
            const report = result.lhr;
            console.log(`${path}: ${summary(report)}`);
            const misses = missed(report);
            if (misses.length > 0) failures.push(`${path} (${misses.join(', ')})`);
        }
        await browser.close();
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
