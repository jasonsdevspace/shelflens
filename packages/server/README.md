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
