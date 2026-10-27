# @shelflens/api

The store's GraphQL API: the schema the storefront is written against, and the resolvers that
answer it over `@shelflens/search`.

- **The schema is the contract.** `schema.graphql` is written and reviewed before any resolver,
  and the types on both sides are generated from it by `npm run codegen`. A change to the schema
  that breaks the client or a resolver fails the build. The decision record on its shape is
  [number 5](../../docs/decisions/0005-the-shape-of-the-api.md).
- **The viewer comes from the request.** Prices and visibility follow the customer group in the
  `shelflens-customer-group` header. There is no argument that asks for another group's prices.
- **Requests have limits.** Depth and width are checked at validation. A client's own mistake
  comes back with a message and a code. A resolver's failure comes back as one fixed message
  with a path, never the reason.
- **Nothing from Node.** The schema is inlined into a generated module, lint refuses a Node
  import, and a test bundles the package for a browser under a size budget, because the demo runs
  it in a service worker. [Decision record 6](../../docs/decisions/0006-the-api-runs-in-the-browser.md)
  explains why.

```ts
import { createStore, createStoreApi, viewerFromHeader } from '@shelflens/api';

const api = createStoreApi(createStore({ catalog }));
const response = await api.run(
    { query: '{ search(input: { phrase: "boot" }) { total } }' },
    viewerFromHeader(request.headers.get('shelflens-customer-group'))
);
```

`packages/server` puts this behind HTTP, and `packages/storefront` puts it in a service worker.
