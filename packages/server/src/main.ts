import { createStore, createStoreApi } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';

import { createServer } from './server.js';

/**
 * Runs the API locally over the default catalog.
 *
 *   npm run api
 *   curl localhost:8080/graphql --header 'content-type: application/json' \
 *     --data '{ "query": "{ store { name catalogVersion } }" }'
 */
const port = Number(process.env.PORT ?? 8080);
const products = Number(process.env.PRODUCTS ?? 2000);

const store = createStore({ catalog: generateCatalog({ products }) });
const server = createServer({ api: createStoreApi(store) });

server.listen(port, () => {
    console.log(`listening on ${port}, ${products} products, catalog ${store.version}`);
});

const shutdown = () => {
    server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
