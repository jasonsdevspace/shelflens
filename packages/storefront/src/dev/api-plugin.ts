import { readFileSync } from 'node:fs';

import {
    createMemoryEventStore,
    createMemoryRuleStore,
    createStoreHost,
    parseRulesFile,
    routeOf,
} from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { createHandler } from '@shelflens/server';
import type { Plugin } from 'vite';

/**
 * The API inside the dev server.
 *
 * In production the service worker answers `/graphql`. A dev server with
 * hot reloading and a service worker fight over the same requests, so in
 * development the same API answers from the dev server instead, through
 * the Node handler the server package already has, over the same store
 * host, catalog and rules file the worker runs. The client cannot tell the
 * difference, which is the point.
 */

/** The rules file the production build ships, read here at startup. */
const rules = () =>
    parseRulesFile(
        JSON.parse(readFileSync(new URL('../../public/rules.json', import.meta.url), 'utf8'))
    );
export const storeApi = (): Plugin => ({
    name: 'shelflens-store-api',
    apply: 'serve',
    configureServer(server) {
        const base = server.config.base;
        const events = createMemoryEventStore();
        const catalog = generateCatalog();
        const shipped = rules();
        // The same host the service worker runs, so the dev server ranks as the demo
        // does: clicks folded in when a visit begins, and rules saved in this session.
        const handle = createHandler({
            host: createStoreHost({
                source: () => Promise.resolve({ catalog, rules: shipped }),
                events,
                rules: createMemoryRuleStore(),
            }),
            base,
            events,
        });
        server.middlewares.use((request, response, next) => {
            if (request.url !== undefined && routeOf(request.url, base) !== undefined) {
                void handle(request, response);
            } else {
                next();
            }
        });
    },
});
