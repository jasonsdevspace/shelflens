import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test as base } from '@playwright/test';
import { parseCatalogFile, parseEventBatch, type StoreEvent } from '@shelflens/api';
import type { Catalog } from '@shelflens/catalog';

import { DEFAULT_DB_NAME } from '../src/worker/event-db.js';

/*
 * What the browser tests share: the test itself, which marks the tour seen
 * unless a file asks otherwise, an axe audit that names what it found, a
 * reader for the events the worker keeps, and the catalog the demo ships.
 *
 * Nothing in these tests is mocked. The page registers the worker, the
 * worker fetches the catalog and builds the store, and every request is
 * answered inside the browser, from the production build.
 */

export { expect };
export type { Page };

export const test = base.extend<{ readonly tourSeen: boolean }>({
    // The tour opens itself on a first visit. Most tests are not that visit, so the
    // tour is marked seen before the page loads, and the tour's own test says not to.
    tourSeen: [true, { option: true }],
    // Playwright hands the page on through this callback, named so it is not taken for a React hook.
    page: async ({ page, tourSeen }, provide) => {
        if (tourSeen) {
            await page.addInitScript(() => localStorage.setItem('shelflens.tour', 'seen'));
        }
        await provide(page);
    },
});

/**
 * Audits the page as it stands with axe, and fails naming each rule broken
 * and the elements that break it. A rule a page has reason to leave out is
 * named in `leaveOut`, with the reason beside the call.
 */
export const audit = async (page: Page, leaveOut: readonly string[] = []): Promise<void> => {
    expect(await violationsOf(page, leaveOut)).toEqual([]);
};

/**
 * What axe finds on the page as it stands, each as the rule broken and the
 * elements that break it, for a test that collects them before judging.
 */
export const violationsOf = async (
    page: Page,
    leaveOut: readonly string[] = []
): Promise<string[]> => {
    const builder = new AxeBuilder({ page });
    const results = await (
        leaveOut.length > 0 ? builder.disableRules([...leaveOut]) : builder
    ).analyze();
    return results.violations.map(
        (violation) =>
            `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`
    );
};

/**
 * The events the worker keeps, read from the IndexedDB the page shares
 * with it, oldest first. Nothing when the worker has kept none yet.
 */
export const keptEvents = async (page: Page): Promise<StoreEvent[]> => {
    const kept = await page.evaluate(
        (name) =>
            new Promise<unknown[]>((resolve, reject) => {
                const opening = indexedDB.open(name);
                opening.onerror = () => reject(opening.error ?? new Error('could not open'));
                opening.onsuccess = () => {
                    const db = opening.result;
                    if (!db.objectStoreNames.contains('events')) {
                        db.close();
                        resolve([]);
                        return;
                    }
                    const read = db.transaction('events').objectStore('events').getAll();
                    read.onsuccess = () => {
                        db.close();
                        resolve(read.result);
                    };
                    read.onerror = () => {
                        db.close();
                        reject(read.error ?? new Error('could not read'));
                    };
                };
            }),
        DEFAULT_DB_NAME
    );
    // Read as the store reads a batch, so an event it would refuse fails here.
    return kept.map((item) => {
        const [event] = parseEventBatch([item]) ?? [];
        if (!event)
            throw new Error(`expected an event the store accepts, not ${JSON.stringify(item)}`);
        return event;
    });
};

/**
 * The catalog the demo ships, read from the built site as a page reads it, and checked as the
 * store checks a catalog file, so one it would refuse fails here.
 */
export const shippedCatalog = async (request: APIRequestContext): Promise<Catalog> =>
    parseCatalogFile(await (await request.get('/catalog.json')).json());

/** The rules panel, opened beside the results on a wide screen, or in its drawer on a phone. */
export const rulesPanel = async (page: Page, isMobile: boolean) => {
    if (isMobile) await page.getByRole('button', { name: 'Edit rules' }).tap();
    return isMobile
        ? page.getByRole('dialog', { name: 'Rules' })
        : page.getByRole('complementary', { name: 'Rules' });
};

/** The browser's own default text size, at 16px, as a visitor sets it in their settings. */
const DEFAULT_TEXT = { standard: 16, fixed: 13 };

/**
 * Sets the browser's default text size to `scale` times the usual, as a
 * visitor's own larger text sets it. Every size here is drawn from it, and a
 * media query in rem reads it too, so the layout that larger text brings is
 * the one measured. Chromium only, through its protocol.
 */
export const setTextSize = async (page: Page, scale: number): Promise<void> => {
    const session = await page.context().newCDPSession(page);
    await session.send('Page.setFontSizes', {
        fontSizes: {
            // The protocol takes whole pixels.
            standard: Math.round(DEFAULT_TEXT.standard * scale),
            fixed: Math.round(DEFAULT_TEXT.fixed * scale),
        },
    });
    await session.detach();
};

/** Waits two frames, for what the page does on a resize or a new text size to be drawn. */
export const settle = (page: Page): Promise<void> =>
    page.evaluate(
        () =>
            new Promise<void>((done) => {
                requestAnimationFrame(() => requestAnimationFrame(() => done()));
            })
    );
