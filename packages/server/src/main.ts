import { readFileSync } from 'node:fs';

import {
    createMemoryEventStore,
    createMemoryRuleStore,
    createStoreHost,
    parseRulesFile,
} from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';

import { createServer, type OriginPath, type OriginsSupport } from './server.js';

/**
 * Runs the API locally over the default catalog.
 *
 *   npm run api
 *   curl localhost:8080/graphql --header 'content-type: application/json' \
 *     --data '{ "query": "{ store { name catalogVersion } }" }'
 *
 * `PERSISTED_ONLY=true` refuses full queries, as the public demo does.
 * `RULES=path` loads merchandising rules from a JSON file, validated here.
 * `ORIGINS=https://a.example,https://b.example` lets pages on those origins
 * use the API, as the widget does on a page the store does not serve, and
 * `ORIGIN_PATHS=graphql,events` says which paths they may use. `OWN_ORIGIN`
 * names the store's own page when a proxy in front rewrites the host.
 */
const port = Number(process.env.PORT ?? 8080);
const products = Number(process.env.PRODUCTS ?? 2000);
const rules =
    process.env.RULES === undefined
        ? []
        : parseRulesFile(JSON.parse(readFileSync(process.env.RULES, 'utf8')));
const listed = (name: string): readonly string[] =>
    (process.env[name] ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
const isOriginPath = (path: string): path is OriginPath =>
    path === 'graphql' || path === 'events' || path === 'rules';
/** An origin as a browser sends it: scheme and host, no path, no trailing slash, lowercase. */
const asOrigin = (entry: string): string => {
    const origin = new URL(entry).origin;
    if (origin === 'null')
        throw new Error(`ORIGINS holds something that is not an origin: ${entry}`);
    return origin;
};
const allowedOrigins = listed('ORIGINS').map(asOrigin);
const originPaths = listed('ORIGIN_PATHS').map((path) => {
    if (!isOriginPath(path))
        throw new Error(`ORIGIN_PATHS holds a path the store has not got: ${path}`);
    return path;
});
const own = process.env.OWN_ORIGIN === undefined ? undefined : asOrigin(process.env.OWN_ORIGIN);
const origins: OriginsSupport | undefined =
    allowedOrigins.length > 0
        ? {
              allowed: allowedOrigins,
              ...(originPaths.length > 0 && { paths: originPaths }),
              ...(own !== undefined && { own }),
          }
        : undefined;

const catalog = generateCatalog({ products });
const events = createMemoryEventStore();
// The same host the service worker runs: the clicks folded in when a visit begins,
// and rules a merchandiser saves kept in memory for as long as the server runs.
const host = createStoreHost({
    source: () => Promise.resolve({ catalog, rules }),
    events,
    rules: createMemoryRuleStore(),
});
const server = createServer({
    host,
    persistedOnly: process.env.PERSISTED_ONLY === 'true',
    // Only behind a proxy that sets the forwarded headers, which a client could otherwise forge.
    trustProxy: process.env.TRUST_PROXY === 'true',
    events,
    ...(origins && { origins }),
});

// The store is built before the port is taken, so a rules file the catalog cannot
// satisfy stops the server here rather than failing every request after it.
const { api } = await host.current();
server.listen(port, () => {
    console.log(
        `listening on ${port}, ${products} products, ${rules.length} rules, store ${api.version}` +
            (origins ? `, open to ${origins.allowed.join(' ')}` : '')
    );
});

const shutdown = () => {
    server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
