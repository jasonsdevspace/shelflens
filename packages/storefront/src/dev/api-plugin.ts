import { readFileSync } from 'node:fs';

import type { Rule } from '@jasonsdevspace/shelflens';
import {
    createMemoryEventStore,
    createMemoryRuleStore,
    createStore,
    createStoreApi,
    parseRulesFile,
    routeOf,
    withResponseCache,
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
 * the Node handler the server package already has, over the same catalog
 * and the same rules file the worker ships. The client cannot tell the
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
        // The store with the rules in effect: the shipped file, or what a
        // merchandiser saved in this dev session.
        const built = (saved: readonly Rule[] | undefined) =>
            createStore({ catalog, rules: saved ?? shipped, rulesEdited: saved !== undefined });
        const shippedStore = built(undefined);
        const shippedApi = withResponseCache(createStoreApi(shippedStore, { events }));
        const handle = createHandler({
            api: shippedApi,
            base,
            events,
            rules: {
                store: createMemoryRuleStore(),
                shipped,
                // Checked on the store already built, which costs a reconfigure, not an index.
                check: (draft) => {
                    shippedStore.engine.reconfigure({ rules: draft });
                },
                build: (saved) =>
                    saved === undefined
                        ? shippedApi
                        : withResponseCache(createStoreApi(built(saved), { events })),
            },
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
