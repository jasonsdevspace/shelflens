# @shelflens/server

The API over HTTP, for local runs and for any host that cannot run a service worker.

One endpoint, `POST /graphql`, and `GET /health`. The customer group arrives in the
`shelflens-customer-group` header, standing in for the session a real store would have. Each
response carries an `x-request-id` to quote. Bodies are bounded, and each client gets a fixed
number of requests per minute before a 429, counted in memory, which is the right trade for one
instance and the wrong one for a fleet.

```bash
npm run api
curl localhost:8080/graphql --header 'content-type: application/json' \
  --header 'shelflens-customer-group: member' \
  --data '{ "query": "{ store { name catalogVersion } }" }'
```

`createHandler` is the request handler on its own, for a host that already has a server. The
storefront's dev server uses it to answer `/graphql` in development, so the same API runs there
that the worker runs in production. `createServer` wraps it in `node:http`.

`PORT` and `PRODUCTS` set the port and the size of the generated catalog.
