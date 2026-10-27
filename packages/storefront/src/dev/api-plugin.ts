import { createStore, createStoreApi } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { createHandler } from '@shelflens/server';
import type { Plugin } from 'vite';

/**
 * The API inside the dev server.
 *
 * In production the service worker answers `/graphql`. A dev server with
 * hot reloading and a service worker fight over the same requests, so in
 * development the same API answers from the dev server instead, through
 * the Node handler the server package already has. The client cannot tell
 * the difference, which is the point.
 */
export const storeApi = (): Plugin => ({
    name: 'shelflens-store-api',
    apply: 'serve',
    configureServer(server) {
        const base = server.config.base;
        const handle = createHandler({
            api: createStoreApi(createStore({ catalog: generateCatalog() })),
        });
        server.middlewares.use((request, response, next) => {
            if (request.url === `${base}graphql`) {
                void handle(request, response);
            } else {
                next();
            }
        });
    },
});
