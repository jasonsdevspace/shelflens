# @shelflens/server

The API over HTTP, for local runs and for any host that cannot run a service worker.

Three paths, `/graphql`, `/events` and `/rules`, and `GET /health`. A persisted operation is a `GET` naming one of the
storefront's operations by hash, with its variables and the store version it expects in the
URL. A full query is a `POST`, refused when `persistedOnly` is set, as the public demo does. The
customer group arrives in the `shelflens-customer-group` header, standing in for the session a
real store would have. Each answer says what may be cached: `public` for its age under the
version that answered it, varying on the group, and `no-store` otherwise. Each response carries
an `x-request-id` to quote. Bodies are bounded, and each client gets a fixed number of requests
per minute before a 429, counted in memory, which is the right trade for one instance and the
wrong one for a fleet.

```bash
npm run api
curl localhost:8080/graphql --header 'content-type: application/json' \
  --header 'shelflens-customer-group: member' \
  --data '{ "query": "{ store { name catalogVersion } }" }'
```

The store comes from the same store host the service worker runs, `createStoreHost` in
`@shelflens/api`. A batch posted to `/events` is kept, and a request that names no store version,
which is how a page asks its first question, folds the clicks collected since into ranking before
it is answered. A request mid-visit names the version it has and keeps it. `/rules` reads,
replaces and resets the rules in effect, as the demo's rules editor does in the browser, kept in
memory for as long as the server runs. A save keeps the index and applies the new set, under a
new store version.

`createHandler` is the request handler on its own, for a host that already has a server. The
storefront's dev server uses it with a store host of its own, so the store that answers in
development is built and refreshed as the worker's is in production. `createServer` wraps it in
`node:http`. Either takes a `host`, or a fixed `api` for a store that never changes, which
answers `/rules` with a 404.

`PORT` and `PRODUCTS` set the port and the size of the generated catalog. `PERSISTED_ONLY=true`
refuses full queries. Behind one proxy that adds `x-forwarded-for` and sets `x-forwarded-proto`, `TRUST_PROXY=true` lets the rate limit count the address the proxy added, the last in the list, and the server read its own scheme from the proxy. Without it both headers are ignored, since any client can send them, so a server behind a proxy that ends TLS needs it, or `OWN_ORIGIN`, for its own page to be its own.

Every answer says its JSON is only JSON and loads nothing, and a refusal or a failure is never
kept by a cache. A body past 16 KB is answered with a 413, and the connection closes after it.

## A page on another origin

The widget can be mounted on a page the store does not serve, and that page's requests cross
an origin. The server refuses a request from another origin unless the host names the origin,
so a page the host did not name cannot read the catalog, send events or save rules through it.

```bash
ORIGINS=https://shop.example,https://www.shop.example npm run api
```

`ORIGINS` is a list of origins, each a scheme and a host, never a wildcard. The server answers
the browser's preflight for them, with the customer group header among those the page may send,
and every answer to them varies on the origin. By default those origins may use the API alone.
`ORIGIN_PATHS=graphql,events` opens the events path to them too, and `rules` the rules path,
which a host should open only to a page it would let a merchandiser use. A request that names
the server's own origin is the store's own page and needs no leave. The server takes that origin
from the request, its scheme and its host, so behind a proxy that rewrites the host, name it with
`OWN_ORIGIN=https://shop.example`. A page on another origin may read the store version and the
request id from each answer, so the widget there caches as the store's own page does.

With the server running, the host page loads the widget's file from the demo or from a copy of
it, and mounts the box with the server's address as the API and the store's page for searches:

```html
<div id="search"></div>
<script type="module">
    import { mountShelfLens } from 'https://jasonsdevspace.com/shelflens/widget.js';
    mountShelfLens(document.getElementById('search'), {
        apiUrl: 'https://api.shop.example/graphql',
        storeUrl: 'https://shop.example/',
    });
</script>
```

The browser test in the storefront does exactly this: a page served from an origin of its own,
the widget's file from the demo, and this server open to that one origin.
