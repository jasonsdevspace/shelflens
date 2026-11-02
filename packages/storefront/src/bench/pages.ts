import type { Page } from '@playwright/test';

import { SAMPLE_FILE, SAMPLE_PRODUCTS, sampleCsv } from '../try/sample.js';

/*
 * Every page the demo serves, in the states worth checking, for the
 * Lighthouse audit and the browser test that audits each in both themes.
 */

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
export const PAGES: readonly {
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
