// @vitest-environment node
import type { AddressInfo } from 'node:net';

import { createMemoryEventStore, createStoreHost } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { createServer } from '@shelflens/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createWorkerApi } from '../worker/handle.js';
import { serving } from '../worker/serving.js';

/*
 * The demo's store answers from the service worker, and `npm run api` from
 * the Node server. Both run the API's store host, and this shows they rank
 * alike: one batch of clicks sent to each, and the next visit to each sees
 * the same nudge on the same products.
 */

const catalog = generateCatalog({ seed: 42, products: 200 });

const SEARCH = `{ search(input: { phrase: "jacket", pageSize: 5 }) {
    items { product { sku } explanation { popularity { clicks weight } } } } }`;

interface Ranked {
    readonly sku: string;
    readonly popularity: unknown;
}

const rankedOf = async (response: Response | undefined): Promise<Ranked[]> => {
    const answer = (await response?.json()) as {
        data: {
            search: { items: { product: { sku: string }; explanation: { popularity: unknown } }[] };
        };
    };
    return answer.data.search.items.map((item) => ({
        sku: item.product.sku,
        popularity: item.explanation.popularity,
    }));
};

const worker = createWorkerApi({
    catalogUrl: 'catalog.json',
    base: '/',
    fetch: serving(catalog),
    allowFullQueries: true,
    events: createMemoryEventStore(),
});

const nodeEvents = createMemoryEventStore();
const node = createServer({
    host: createStoreHost({
        source: () => Promise.resolve({ catalog, rules: [] }),
        events: nodeEvents,
    }),
    events: nodeEvents,
});
let nodeBase = '';

beforeAll(async () => {
    await new Promise<void>((resolve) => node.listen(0, resolve));
    nodeBase = `http://127.0.0.1:${(node.address() as AddressInfo).port}`;
});
afterAll(async () => {
    await new Promise<void>((resolve) => node.close(() => resolve()));
});

const ask = (origin: string, path: string, body: string) =>
    new Request(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
    });

describe('the worker and the Node server', () => {
    it('nudge the same products by the same amount after one batch of clicks', async () => {
        const query = JSON.stringify({ query: SEARCH });
        const before = await rankedOf(
            await worker.handle(ask('https://example.test', '/graphql', query))
        );
        expect(await rankedOf(await fetch(ask(nodeBase, '/graphql', query)))).toEqual(before);

        // Clicks on the lowest of the five, from two shoppers, sent to each host as a page sends them.
        // Five results to nudge the last of, so a change to the catalog fails here and says so.
        expect(before).toHaveLength(5);
        const lowest = before[4]?.sku ?? '';
        const batch = JSON.stringify(
            ['a', 'b', 'b'].map((session, index) => ({
                id: `c${String(index)}`,
                kind: 'click',
                at: index + 1,
                sku: lowest,
                session,
                phrase: 'jacket',
                position: 5,
            }))
        );
        expect((await worker.handle(ask('https://example.test', '/events', batch)))?.status).toBe(
            204
        );
        expect((await fetch(ask(nodeBase, '/events', batch))).status).toBe(204);

        // The next visit: the worker refreshes as a page loads, the server on a request with no version.
        await worker.refresh();
        const fromWorker = await rankedOf(
            await worker.handle(ask('https://example.test', '/graphql', query))
        );
        const fromNode = await rankedOf(await fetch(ask(nodeBase, '/graphql', query)));
        expect(fromWorker).not.toEqual(before);
        expect(fromNode).toEqual(fromWorker);
    });
});
