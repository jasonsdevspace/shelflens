import { readFileSync } from 'node:fs';

import {
    createMemoryEventStore,
    createStore,
    createStoreApi,
    parseRulesFile,
    withResponseCache,
} from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';

import { createServer } from './server.js';

/**
 * Runs the API locally over the default catalog.
 *
 *   npm run api
 *   curl localhost:8080/graphql --header 'content-type: application/json' \
 *     --data '{ "query": "{ store { name catalogVersion } }" }'
 *
 * `PERSISTED_ONLY=true` refuses full queries, as the public demo does.
 * `RULES=path` loads merchandising rules from a JSON file, validated here.
 */
const port = Number(process.env.PORT ?? 8080);
const products = Number(process.env.PRODUCTS ?? 2000);
const rules =
    process.env.RULES === undefined
        ? []
        : parseRulesFile(JSON.parse(readFileSync(process.env.RULES, 'utf8')));

const store = createStore({ catalog: generateCatalog({ products }), rules });
const server = createServer({
    api: withResponseCache(createStoreApi(store)),
    persistedOnly: process.env.PERSISTED_ONLY === 'true',
    events: createMemoryEventStore(),
});

server.listen(port, () => {
    console.log(
        `listening on ${port}, ${products} products, ${rules.length} rules, store ${store.version}`
    );
});

const shutdown = () => {
    server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
