/**
 * Lighthouse's accessibility audit over the built demo, which must score
 * a hundred on every page it checks.
 *
 *   npm run lighthouse
 *
 * Runs after `npm run storefront` has built the page. The pages are served
 * by the preview server, the worker registers and claims each page, and
 * the audit waits for the page to be ready before it looks.
 */
import { spawn } from 'node:child_process';

import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const PORT = 4176;
const ORIGIN = `http://localhost:${PORT}`;
const PAGES = ['/', '/?q=jacket&explain=1', '/?category=shoes', '/?product=SL-00001'];

const startPreview = () =>
    new Promise((resolve, reject) => {
        const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
            cwd: 'packages/storefront',
            stdio: ['ignore', 'pipe', 'inherit'],
        });
        child.stdout.on('data', (chunk) => {
            if (chunk.toString().includes(String(PORT))) resolve(child);
        });
        child.on('exit', (code) => reject(new Error(`the preview exited with ${code}`)));
    });

const preview = await startPreview();
const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox'],
});
let failed = false;
try {
    for (const path of PAGES) {
        const result = await lighthouse(`${ORIGIN}${path}`, {
            port: chrome.port,
            onlyCategories: ['accessibility'],
            output: 'json',
            logLevel: 'error',
            // The worker needs a moment to claim the page before there is a page to audit.
            pauseAfterLoadMs: 3000,
            pauseAfterFcpMs: 3000,
        });
        const score = result?.lhr.categories.accessibility?.score ?? 0;
        const findings = Object.values(result?.lhr.audits ?? {})
            .filter((audit) => audit.score !== null && audit.score < 1)
            .map((audit) => audit.id);
        console.log(
            `${path}: accessibility ${Math.round(score * 100)}${findings.length ? `, ${findings.join(', ')}` : ''}`
        );
        if (score < 1) failed = true;
    }
} finally {
    await chrome.kill();
    preview.kill();
}
if (failed) {
    console.error('a page scored below a hundred for accessibility');
    process.exit(1);
}
