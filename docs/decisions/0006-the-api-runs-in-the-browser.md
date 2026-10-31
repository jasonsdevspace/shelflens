# 6. The API runs in the browser, and in Node when asked

**Status:** accepted

## Context

The demo deploys to GitHub Pages, which serves files and runs nothing. A search API that needed
a server would mean paying for one, keeping it up, and a demo that stops working the day it is
not. The project decided at the start to run as much as possible in the browser, and to weigh a
server only if a feature needed one.

The question was whether a GraphQL API could run in a service worker well enough to be the real
thing rather than a mock. A worker has no Node, no file system and a download budget.

## Options

**A. A hosted server.** Node, a container, a platform. The API would be exactly what a storefront
talks to in production. The demo would depend on it being up.

**B. The API in a service worker.** The same resolvers over the same engine, answering `fetch`
requests for `graphql` under the site's path from inside the page. The storefront makes real network
requests and gets real responses, so every network behavior stays real: stale responses, debounce,
caching by key. Only the hop to a server is missing.

**C. Call the engine directly from the storefront.** No GraphQL at all in the demo. Fastest to
build, and the schema, the contract the whole storefront is written against, would never be
exercised.

## Decision

Option B, with option A available at any time.

- **The API package has nothing from Node in it.** The schema is generated into a TypeScript
  module beside the types, so building it reads no file, and a lint rule refuses a Node import
  anywhere in the package. A test bundles the API for a browser and fails if anything Node-only
  has crept in.
- **It is small enough to download.** The GraphQL reference library's execution core is 43 KB
  compressed, and the engine, the store search and the catalog together are 11 KB. The test
  keeps the whole API under 90 KB compressed.
- **The Node server is a thin wrapper.** `@shelflens/server` puts the same API behind
  `POST /graphql` with a customer-group header, a body limit, a rate limit and a request id. It
  exists for local runs, for tests that want a real socket, and for the day a hosted demo is
  wanted. Nothing in the API knows which one it is running under.
- **The viewer comes from the request in both.** The server and the worker read the same
  header. The API only ever sees a viewer it was handed.

## Consequences

- The demo's index is built in the worker from the shipped catalog on first load, which is why
  the catalog has a size budget and the index has a benchmark. The cold first visit is measured
  in `docs/benchmarks/cold-visit.md`: on the demo catalog the worker spends about 38 ms
  downloading the catalog and the rules and 55 ms building the store, served locally.
- A worker is one JavaScript thread. The engine's wide queries cost about a tenth of a second on a
  hundred thousand products and well under a millisecond's worth on the demo's two thousand, so
  the page stays responsive, but a far larger catalog would need the index built off the main
  path and persisted.
- Rate limiting in a worker protects nothing, since the client is the server. It is implemented
  in the Node server where it means something, and the worker does not pretend.
- Persisted operations work the same way in both: each accepts one of the storefront's
  operations by the hash of its text, and the demo accepts nothing else, so nothing a browser can
  send runs a query the storefront did not ship. Record 8 describes the caches built on that.
- A host page for the widget under the worker's scope registers the worker as the store's page
  does, and the widget never does: it is handed the API's address and knows nothing about which
  host answers. A page on another origin is answered by the Node server, which the host runs with
  that origin named and nothing else allowed. Record 12 has the widget.

## How it is tested

- The browser bundle test, with its size budget.
- The server tests, over a real socket: the group header, the body limit, the rate limit and the
  request id.
- The worker itself is tested where it lives, in the storefront, and the browser suite runs the
  production build with the worker answering.
