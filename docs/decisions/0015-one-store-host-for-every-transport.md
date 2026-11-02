# 15. One store host for every transport

**Status:** accepted

## Context

The store is served three ways: by the service worker in a visitor's browser, by the Node server
behind `npm run api`, and by the dev server while the storefront is built. Each one made its
store its own way. The worker built the store from the catalog, the rules saved in IndexedDB and
the clicks it kept, and built it again when a visit began after new clicks or a set of rules was
saved. The Node server and the dev server built one store at start and kept the events posted to
them without ever ranking by them. The dev server built the whole store again on a save, by code
of its own, and the Node server had no rules path at all. A change to how clicks nudge ranking could be tested in the browser and never
reach the server, and a test against the server proved nothing about the store a visitor gets.

A save was also costly where it worked. The worker built the whole store again for a new set of
rules, the index included, though the catalog had not changed.

## Options

**Each host builds its own store.** Keep the worker as it was and teach the server and the dev
server to refresh on a visit and to save rules, each in its own code. Three copies of the same
rules for when a store is built again, which drift the first time one of them is changed and not
the others, and three places to fix the ordering of a save racing a visit.

**The server proxies to the worker's code.** Have the Node server import the worker's handler.
The handler is bound to the service worker's world: its caches, its IndexedDB, its scope. The
server would carry all of it to use none of it.

**One store host in the API, with each transport around it.** Move what decides the store into
`@shelflens/api`, which already runs in both places, and leave each host only what is truly its
own: how requests arrive, where events and rules are kept, and where answers are cached.

## Decision

**One store host.** `createStoreHost` takes a source for the catalog and the shipped rules, an
event store and a rule store. It builds the store the first time anything asks. It builds again,
as a new version, when a visit begins and the clicks have changed since, and when a set of rules
is saved or reset. Changes are made one at a time in the order asked, so a visit and a save that
arrive together both land and neither undoes the other. A change whose inputs match the store
being served builds nothing.

The worker, the Node server and the dev server each wrap the same host. The worker gives it the
IndexedDB stores and drops the other versions' kept answers when a new store is served. The Node
server and the dev server give it stores in memory. Each transport treats a request that names
no store version as the start of a visit and asks the host to refresh first, as the worker
already did on a page load.

A build over the same catalog keeps the index, the completions and the product lookups, and
reconfigures the engine with the new rules and clicks. At the cap on a visitor's catalog, ten
thousand products, a save takes a few milliseconds on a laptop where a cold build takes a quarter
to a third of a second.

## Consequences

- A test of the Node server is now a test of the store a visitor's browser builds. The server
  tests post clicks over a real socket and see them ranked on the next visit, and not mid-visit.
- The worker's own code is now its transport and its catalog: which catalog to load, the
  database a visitor's catalog keeps, and the answers it caches.
- The Node server answers `/rules` as the worker does, kept in memory for as long as it runs. A
  server that should not take saves is given a fixed API instead of a host.
- A fixed API is still accepted, for a store that never changes and for tests that want one.
- The host's rules for building again are tested once, in the API package, rather than in each
  transport.
