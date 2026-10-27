# 7. A GraphQL client of our own, rather than Apollo or urql

**Status:** accepted

## Context

The storefront talks to the API over GraphQL. Apollo Client and urql are the usual choices, and
either would have given the popover a working request in an afternoon, with a normalized cache,
retries and a devtools panel thrown in.

The popover has two behaviors that decide whether search feels right. A burst of keystrokes must
cost one request, not five. And the response that arrives last must not win: the answer to "tra"
can come back after the answer to "trail", and if it is shown the shopper sees suggestions for a
phrase they are no longer typing. Both behaviors are exactly the kind of thing a library handles
somewhere inside, and this project exists to show them.

Later milestones add a third: a cache whose key includes the customer group, so a member's
price is never served to a guest. That is a cache-key bug that a normalized cache makes easy to
introduce and hard to see.

## Options

**A. Apollo Client.** Full featured, widely known, about 40 KB compressed before the page's own
code, and a normalized cache whose key is the typename and id, with the viewer added only by
configuration.

**B. urql.** Smaller, with a document cache by default, and exchanges to customize. The same
question about the key, answered in a different place.

**C. A client written here.** One function that posts a typed document and returns the data or
throws the errors. Stale handling and debouncing live beside it as small pieces with their own
tests. The cache, when it comes, is a map with a key the project defines.

## Decision

Option C.

- **Typed without a runtime.** The operations are written as GraphQL files and generated into
  typed strings, so the client is typed end to end and ships no parser or printer. The page's
  bundle holds React and the storefront's own code, and nothing from GraphQL.
- **Stale responses are a separate piece.** A "latest" helper hands each request a ticket,
  aborts the one before it, and reports a result as stale when its ticket is no longer current.
  The popover ignores stale results. The helper is tested on its own, and the popover is tested
  against a network shim that answers requests out of order.
- **Debouncing is visible.** The pause is a named constant beside the minimum phrase length,
  and a test proves a burst of keystrokes sends one request.
- **The viewer travels in a header,** set once when the client is created. There is no way to
  ask for another group's prices from a query, which is the shape the cache key will follow.

## Consequences

- No retries, no normalized cache and no devtools. The demo does not need the first two, and the
  explain mode is the project's devtools.
- Each new behavior is written rather than configured. That is the cost the project accepts for
  being able to point at the code when a reviewer asks how it works.
- If a storefront built on this engine wanted Apollo, nothing stops it. The API is ordinary
  GraphQL, and the client is the demo's, not the engine's.

## How it is tested

- The latest-request helper: an earlier result that arrives later is stale, an earlier run is
  aborted when a later one starts, and a canceled run is stale.
- The popover: one request for a burst of keystrokes, nothing for one character, and the newest
  phrase's answer shown even when an older answer arrives after it.
- The client: the document, the variables and the viewer header on the wire, errors with their
  codes, and the abort signal passed through.
