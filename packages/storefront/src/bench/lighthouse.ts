import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

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
 */

const PORT = 4176;
/** A store page is ready once the worker answers and the search box appears. */
const STORE_READY = { name: 'Search the store' };

/** Each page audited, and what to wait for before the audit, when there is something. */
const PAGES: readonly { readonly path: string; readonly ready?: typeof STORE_READY }[] = [
    { path: '/', ready: STORE_READY },
    { path: '/?q=jacket&explain=1', ready: STORE_READY },
    { path: '/?category=shoes', ready: STORE_READY },
    { path: '/?product=SL-00001', ready: STORE_READY },
    { path: '/about/' },
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
        for (const { path, ready } of PAGES) {
            await page.goto(`${preview.origin}${path}`);
            if (ready) await page.getByRole('combobox', ready).waitFor();
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
