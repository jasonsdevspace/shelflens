import { routeOf } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { createHandler, createLocalHost, readRulesFile } from '@shelflens/server';
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
const RULES_FILE = new URL('../../public/rules.json', import.meta.url);

export const storeApi = (): Plugin => ({
    name: 'shelflens-store-api',
    apply: 'serve',
    configureServer(server) {
        const base = server.config.base;
        // The same host the Node server runs locally, and the service worker in
        // production: clicks folded in when a visit begins, and rules saved in this session.
        const handle = createHandler({
            host: createLocalHost({ catalog: generateCatalog(), rules: readRulesFile(RULES_FILE) }),
            base,
        });
        server.middlewares.use((request, response, next) => {
            // Only the store's own routes, as the Node server serves them. A visitor's catalog is
            // the worker's alone.
            if (request.url !== undefined && routeOf(request.url, base) !== undefined) {
                void handle(request, response);
            } else {
                next();
            }
        });
    },
});
