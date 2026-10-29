# 9. Events land beside the API, and stay in the browser

**Status:** accepted

## Context

Release 2 starts with what a shopper does: the phrases searched, the results clicked, the
products viewed. Recommendations and a nudge to ranking are built from them later. The brief
sets the rules for collecting them: batched and sent with `sendBeacon`, never blocking the page,
surviving being blocked, counting a retried batch once, carrying no personal data, and stopping
entirely when the browser sends Global Privacy Control.

Two things about this project make the usual answer not fit. The API is a service worker in
the visitor's browser, which the browser stops after a few seconds idle, so there is no process
that stays up to hold what arrived. And the public demo accepts only its own persisted
operations, refusing every `POST` to `graphql`, which is where a mutation would have to go.

## Options

**Where events arrive.** A GraphQL mutation, which is the shape the rest of the API has. Or a
plain `POST` to `events` beside `graphql`, outside the schema.

**Where events are kept.** In the worker's memory, which is simplest. In the page's own storage,
sent along with each request, so the page owns the history. Or in IndexedDB inside the worker,
which the worker, the page and a browser test can all open.

**Whether to seed a history.** A synthetic history generated with the catalog, so the
recommendations rail has something to show on a first visit. Or none, so the rail starts cold.

## Decision

A plain `POST`, kept in IndexedDB, with no seeded history.

A beacon cannot set a header, so the viewer header the API varies on is not available, and a
mutation would need a hole in the persisted-only rule for an operation that returns nothing.
The receiver is one function in the API package, `receiveEvents`, called by the worker, the
Node server and the dev server, so the three cannot disagree about what a batch is. A batch is
a closed set of fields, and one unknown field refuses the whole batch, so nothing a page did not
mean to send can arrive by accident. A phrase is folded to a few lower case words and capped,
so a name typed into the search box arrives as words, never as a record. Every event carries an
id the page made, and the store keeps each id once, so a beacon the browser took and delivered
twice counts once. A batch carrying the browser's privacy signal is answered and dropped, and
the page under that signal queues nothing in the first place.

Memory would lose the history between two clicks, since the worker is stopped in between.
Storage in the page would make the page the owner of API state, which the Node host could not
share. IndexedDB outlives the worker, the page can open it so a browser test can see what
arrived, and it needs nothing from Node, so the implementation sits with the worker and the
memory implementation serves the Node server and the tests. The store is bounded at ten
thousand events, oldest first out.

A seeded history would cost the thing the rail exists to show. With shipped history the cold
start fallback would never fire in the demo, and the tour would name a test for behavior a
reviewer could not see. So the history starts empty, and the rail says plainly whether it is
showing what was viewed together or the category's most rated.

## Consequences

- Events are per browser. The demo's recommendations reflect one visitor, which the README says
  plainly, and a reviewer who clears site data starts over.
- The collector in the page never awaits a request. A batch the browser refuses waits for the
  next flush, bounded, so a browser without `sendBeacon` costs nothing but the events.
- Nothing is sent before the worker claims the page, since a `POST` to `events` on the network
  would find nothing there.
- The receiver takes no viewer, so an event is not tied to a group. Pricing and visibility are
  applied when recommendations are read, not when events are written.

## How it is tested

- The batch shape: the three kinds with their fields are accepted, an unknown field refuses the
  batch, a phrase is folded and capped, and a batch past its size is refused.
- The store: each id once, oldest first, the oldest gone past the limit.
- The receiver: a batch is kept with nothing to say, a batch delivered twice is kept once,
  nothing is kept under Global Privacy Control, and anything but a posted list is refused.
- The collector: a batch holds only the closed fields, nothing goes before the host is ready, a
  refused batch waits for the next, the page being hidden or left sends at once, nothing is
  queued when the visitor is not to be tracked, and a missing beacon breaks nothing.
- The worker and the Node server: a posted batch reaches the store each was given.
- In a real browser, through the service worker: a search, a click and a view arrive in
  IndexedDB.
