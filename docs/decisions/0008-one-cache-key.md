# 8. One cache key, defined once, for three layers

**Status:** accepted

## Context

A storefront asks the same questions over and over. The category pages, the facet counts and
the popular phrases are the same for everyone who asks, and answering each from memory is the
difference between an engine that is fast and a site that feels fast. So answers get cached, in
more than one place: in the handler that runs the API, and later in the page and at the edge.

Every cache has a key, and the key is where search caches go wrong. The API prices every
product for the viewer named in the request, and hides the products the viewer may not see.
Nothing in the query says who is asking. A cache keyed on the query and its variables, which is
what a cache built from the request alone looks like, serves the first answer to everyone who
asks the same question next. The first shopper to open a product page as a member sets the
price every guest sees after them, until the entry expires. The bug is silent, intermittent,
and found by a customer.

The second way the key goes wrong is time. A catalog import or a rule change produces new
answers, and a cache that does not know still serves the old ones.

## Options

**A. Each cache defines its own key.** The handler's cache keys on what the handler knows, the
page's cache on what the page knows, the edge on the URL. Each is right or wrong on its own, and
each has to be checked when the viewer, the version or the request shape changes.

**B. One key definition that every cache calls.** A function in the API package that takes the
store version, the viewer and the request, and returns one string. Every cache uses it, and one
test proves what it must contain.

## Decision

Option B. The key is `cacheKey` in `@shelflens/api`, and it is made of:

- **The store version.** The catalog's version and a fingerprint of the rules, folded together
  when the store is built, so an import or a rule change changes every key at once. The rules
  part is derived from the rules themselves rather than remembered, so it cannot be stale by
  omission. Nothing has to be invalidated, because nothing is asked for under the old key again.
- **The whole viewer.** The part a request-only key leaves out. It comes from the request's
  header, as the API already does for pricing, so the key and the resolvers read the same
  source. The key takes every field of the viewer, not the group by name, so a field added
  later is in the key from the day it exists.
- **The operation and its variables,** with the query's insignificant GraphQL characters removed
  and the variables written with their object keys sorted, so a request means the same key however
  it was spelled without changing whitespace inside a value.

The first cache on that key is `withResponseCache`, which wraps the API in the handler. It keeps
the most recently used answers up to a count and an age, shares one run between identical
requests in flight however long it takes, and never keeps an answer with errors. The key is not
an option a host can replace, so the one definition cannot be bypassed from outside the package.
The service worker, the Node server and the dev server all wrap the API with it.

What the key does not contain is the time, so a rule with a time window may stay in effect for
up to the cache's age limit after its window closes. That is the age limit's job, and the
default is five minutes.

**Amended with Release 2.** The clicks shoppers make nudge ranking, and they arrive all the time,
so they could not be a rule: a rule is fingerprinted into the version, and every batch would
have moved every key in three layers and emptied the page's memory. Nor could they be applied
as they arrive, since then page two would disagree with page one. So the clicks are folded into
the store when it is built, as a fingerprint in the version beside the rules', and the worker
builds the store again only when a visit begins and the clicks have changed since. Within a
visit the ranking holds still and every kept answer stays right. A store built with new clicks
is a new version, so nothing kept under the old one is served again, which is the same rule the
catalog and the rules already follow. An answer that reads the events as they are now, the rail
beside a product, says it is volatile instead, and no layer keeps it.

**Amended with the rules editor.** A set of rules a merchandiser saves in the page is a new store
version by the same rule: the worker builds the store again with the saved set and the version
carries its fingerprint, so nothing kept under the old one is served again and nothing is
invalidated by name. A preview of a draft is volatile, like the rail, since the draft is a
question nobody asks twice. [Decision 10](0010-rules-live-in-the-browser.md) has the rest.

### The three layers

Three caches share the key, and each holds it in the form its medium allows.

- **The page.** The client remembers answers in memory, for a count and an age, with the
  operation's persisted name standing for its text, which is how a page with nothing from
  GraphQL in it builds the same key. Every answer carries the store version in a header, and
  the key carries the version the client last saw, so after a catalog change nothing remembered
  is asked for again. The memory is one object the page holds and hands to each client, so a
  reviewer switching between guest and member keeps both viewers' answers, kept apart by the
  key, and the version.
- **The browser, or an edge.** The storefront's operations are persisted: each is named at
  build time by the hash of its text, and the client sends the name in a `GET` with the
  variables and the version it last saw in the URL, and the viewer in a header the cache varies
  on. An answer is marked cacheable only when the URL named the version that answered and
  nothing failed. So the URL is the key, a new version is a new URL, and nothing is ever purged.
  On the Node host that is the browser's own HTTP cache, or an edge in front of it. On the demo
  it cannot be: a response a service worker makes up never enters the browser's HTTP cache. So
  the worker keeps the layer itself, in the Cache API, under the same URL, for the age the
  headers say and varying on the same header, and drops the other versions' URLs when the store
  is built. The public demo accepts only these named operations. A full query is refused, so
  nothing a browser can send runs a query the storefront did not ship.
- **The handler.** `withResponseCache`, above, in the service worker and the Node server.

The handler's cache keys on the query text and the page's on the name. They are the same key
in different spellings: the manifest maps each name to exactly the text the handler sees, and a
test holds the two together.

## Consequences

- Any other cache in the project calls the same function. A page cache or an edge cache that
  needs a key has no reason to write one, and a reviewer has one place to look.
- The version makes invalidation unnecessary and the cache larger. Old entries are never
  asked for again, and the count limit evicts them as the new ones arrive.
- The key is as long as the query. For an in-memory map that costs nothing. A cache that needs
  a short key, such as a URL, hashes this one rather than defining another.
- Building the key means lexing the query, which would cost each hit the work the cache is
  meant to save. A storefront sends the same few query texts over and over, so the canonical
  form of each is remembered and a hit costs a map lookup.

## How it is tested

- The persisted manifest: every document the page can send has a name, and the name stands for
  exactly the text of that document with GraphQL's insignificant characters removed.
- Over HTTP: a persisted operation resolves from its name, variables and expected version, an
  unknown name is refused, a full query is refused where the host says so, and an answer is
  marked cacheable only under the version that answered and with no errors.
- The page's cache: a repeated question is asked once, a guest and a member are kept apart in
  one memory, an answer with errors is not remembered, an answer past its age is asked again,
  and an answer from a new version is asked again without the memory thrashing between two
  versions when two instances answer in turn.
- The worker's kept answers: an answer the headers allow is kept per viewer and served next
  time, an answer past its age is not, and every answer for another version is dropped.
- As a member, on the page and in a real browser: a product guests are told does not exist
  appears, and a discounted product costs less, from the moment the viewer changes.
- The leak: the same cache, keyed on the request alone, serves a member's price and a
  members-only product to a guest. Keyed on `cacheKey`, the guest sees the guest price and no
  product. The test runs both keys through the same wrapper, so the key is the only difference.
- The key is one string for one request however the whitespace and the variable order fall,
  and a different string for a different viewer, version, operation or variables.
- A store built with different rules has a different version without being told, and so a
  different key for the same request.
- The cache itself: a second identical request is a hit, two in flight share one run, an
  entry past its age or past the count is gone, and an answer with errors is never kept.
