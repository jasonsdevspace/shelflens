# @shelflens/api

The store's GraphQL API: the schema the storefront is written against, and the resolvers that
answer it over `@shelflens/search`.

- **The schema is the contract.** `schema.graphql` is written and reviewed before any resolver,
  and the types on both sides are generated from it by `npm run codegen`. A change to the schema
  that breaks the client or a resolver fails the build. The decision record on its shape is
  [number 5](../../docs/decisions/0005-the-shape-of-the-api.md).
- **The viewer comes from the request.** Prices and visibility follow the customer group in the
  `shelflens-customer-group` header. There is no argument that asks for another group's prices.
  A price says whether it is below list and a product says whether it is for members only, and
  both stay inside the viewer's own view: a guest never receives either as true.
- **One cache key.** `cacheKey` is the only definition of what an answer is an answer to: the
  store version, the whole viewer, and the operation with its variables. `withResponseCache`
  remembers answers on that key, and a test shows the leak a key without the viewer causes.
  `cacheKeyOf` builds the same key from parts, with the operation's persisted name standing for
  its text, for a page with nothing from GraphQL in it.
  [Decision record 8](../../docs/decisions/0008-one-cache-key.md).
- **One shape over HTTP.** `resolveRequest` says what a request means and `responseHeaders` what
  its answer may be cached as, so the Node server and the service worker cannot disagree. A
  persisted operation is a `GET` naming one of the storefront's operations by hash, from the
  manifest `npm run codegen` writes, with its variables and the version it expects in the URL.
  A full query is a `POST`, which a host may refuse. An answer is cacheable only under the version
  that answered it, and the viewer is a header the cache varies on.
- **Requests have limits.** Depth and width are checked at validation. A client's own mistake
  comes back with a message and a code. A resolver's failure comes back as one fixed message
  with a path, never the reason.
- **Nothing from Node.** The schema is inlined into a generated module, lint refuses a Node
  import, and a test bundles the package for a browser under a size budget, because the demo runs
  it in a service worker. [Decision record 6](../../docs/decisions/0006-the-api-runs-in-the-browser.md)
  explains why.

```ts
import { createStore, createStoreApi, viewerFromHeader, withResponseCache } from '@shelflens/api';

const api = withResponseCache(createStoreApi(createStore({ catalog })));
const response = await api.run(
    { query: '{ search(input: { phrase: "boot" }) { total } }' },
    viewerFromHeader(request.headers.get('shelflens-customer-group'))
);
```

`packages/server` puts this behind HTTP, and `packages/storefront` puts it in a service worker.
