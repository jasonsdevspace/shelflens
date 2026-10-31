import { chromium, type Page } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

import { SAMPLE_FILE, SAMPLE_PRODUCTS, sampleCsv } from '../try/sample.js';
import { startPreview } from './preview.js';

/**
 * Lighthouse's accessibility audit over the built demo, which must score
 * a hundred on every page it checks.
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
/** A store page is ready once the worker answers and the search box appears. */
const storeReady = (page: Page) =>
    page.getByRole('combobox', { name: 'Search the store' }).waitFor();

/** The page for a visitor's catalog is ready once it asks for a file. */
const chooserReady = (page: Page) =>
    page.getByRole('heading', { level: 1, name: 'Search your own products' }).waitFor();

/** Loads the sample file through the page, as a visitor would, made here rather than read from the build. */
const loadSample = async (page: Page, origin: string) => {
    await page.goto(`${origin}/try/`);
    await page.getByLabel('Choose a file').setInputFiles({
        name: SAMPLE_FILE,
        mimeType: 'text/csv',
        buffer: Buffer.from(sampleCsv()),
    });
    await page.getByRole('button', { name: `Search ${SAMPLE_PRODUCTS} products` }).click();
    await page.getByText(`your own catalog of ${SAMPLE_PRODUCTS} products`).waitFor();
};

/** A search has answered once its results heading appears. */
const resultsReady = (query: string) => (page: Page) =>
    page.getByRole('heading', { level: 1, name: `results for "${query}"` }).waitFor();

/**
 * Each page audited, what to do first when there is something, and what to
 * wait for before the audit. Storage is kept from one page to the next, so
 * the empty page for a visitor's catalog comes before the one that loads a
 * file into it.
 */
const PAGES: readonly {
    readonly path: string;
    readonly prepare?: (page: Page, origin: string) => Promise<void>;
    readonly ready?: (page: Page) => Promise<void>;
}[] = [
    { path: '/', ready: storeReady },
    { path: '/?q=jacket&explain=1', ready: storeReady },
    { path: '/?category=shoes', ready: storeReady },
    { path: '/?product=SL-00001', ready: storeReady },
    { path: '/about/' },
    { path: '/widget/', ready: storeReady },
    { path: '/try/', ready: chooserReady },
    { path: '/try/?q=bag&explain=1', prepare: loadSample, ready: resultsReady('bag') },
    { path: '/try/widget/', ready: storeReady },
];

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
                onlyCategories: ['accessibility'],
                output: 'json',
                logLevel: 'error',
                disableStorageReset: true,
            });
            const score = result?.lhr.categories.accessibility?.score ?? 0;
            const findings = Object.values(result?.lhr.audits ?? {})
                .filter((audit) => audit.score !== null && audit.score < 1)
                .map((audit) => audit.id);
            const detail = findings.length > 0 ? `, ${findings.join(', ')}` : '';
            console.log(`${path}: accessibility ${Math.round(score * 100)}${detail}`);
            if (score < 1) failures.push(path);
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
        throw new Error(`below a hundred for accessibility: ${failures.join(', ')}`);
    }
};

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
