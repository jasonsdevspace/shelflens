# @shelflens/server

The API over HTTP, for local runs and for any host that cannot run a service worker.

One endpoint, `/graphql`, and `GET /health`. A persisted operation is a `GET` naming one of the
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

`createHandler` is the request handler on its own, for a host that already has a server. The
storefront's dev server uses it to answer `/graphql` in development, so the same API runs there
that the worker runs in production. `createServer` wraps it in `node:http`.

`PORT` and `PRODUCTS` set the port and the size of the generated catalog. `PERSISTED_ONLY=true`
refuses full queries.

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
the server's own origin is the store's own page and needs no leave.

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
