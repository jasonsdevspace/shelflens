import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test as base } from '@playwright/test';

/*
 * What the browser tests share: the test itself, which marks the tour seen
 * unless a file asks otherwise, an axe audit that names what it found, and
 * a reader for the events the worker keeps.
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
    const builder = new AxeBuilder({ page });
    const results = await (
        leaveOut.length > 0 ? builder.disableRules([...leaveOut]) : builder
    ).analyze();
    expect(
        results.violations.map(
            (violation) =>
                `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`
        )
    ).toEqual([]);
};

/** An event as the worker keeps it, with the fields the tests read. */
export interface KeptEvent {
    readonly kind: string;
    readonly sku?: string;
    readonly phrase?: string;
    readonly position?: number;
    readonly session?: string;
}

/**
 * The events the worker keeps, read from the IndexedDB the page shares
 * with it, oldest first. Nothing when the worker has kept none yet.
 */
export const keptEvents = (page: Page, database = 'shelflens-events'): Promise<KeptEvent[]> =>
    page.evaluate(
        (name) =>
            new Promise<KeptEvent[]>((resolve, reject) => {
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
                        resolve(read.result as KeptEvent[]);
                    };
                    read.onerror = () => {
                        db.close();
                        reject(read.error ?? new Error('could not read'));
                    };
                };
            }),
        database
    );
