import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test as base } from '@playwright/test';

import { DEFAULT_DB_NAME } from '../src/worker/event-db.js';

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
export const keptEvents = (page: Page): Promise<KeptEvent[]> =>
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
        DEFAULT_DB_NAME
    );

/** The catalog the demo ships, as much of it as the tests read. */
export interface ShippedCatalog {
    readonly products: readonly {
        readonly sku: string;
        readonly name: string;
        readonly visibleTo: readonly string[];
        readonly variants: readonly {
            readonly color: string;
            readonly price: number;
            readonly inStock: boolean;
        }[];
        readonly price: {
            readonly guest: { readonly min: number };
            readonly member: { readonly min: number };
        };
    }[];
}

/** A product only members may see, and one members pay less for, from the catalog the demo ships. */
export const membersAndDiscount = async (request: APIRequestContext) => {
    const catalog = (await (await request.get('/catalog.json')).json()) as ShippedCatalog;
    const membersOnly = catalog.products.find((p) => p.visibleTo.length === 1);
    const discounted = catalog.products.find(
        (p) => p.visibleTo.length === 2 && p.price.member.min < p.price.guest.min
    );
    if (!membersOnly || !discounted) throw new Error('expected a hidden and a discounted product');
    return { membersOnly, discounted };
};

/** The first amount in a line of text, as a number of dollars. */
export const amount = (text: string | null) =>
    Number(/\d+(?:\.\d+)?/.exec((text ?? '').replace(/,/g, ''))?.[0]);
