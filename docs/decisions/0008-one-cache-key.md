# 8. One cache key, defined once

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

- The leak: the same cache, keyed on the request alone, serves a member's price and a
  members-only product to a guest. Keyed on `cacheKey`, the guest sees the guest price and no
  product. The test runs both keys through the same wrapper, so the key is the only difference.
- The key is one string for one request however the whitespace and the variable order fall,
  and a different string for a different viewer, version, operation or variables.
- A store built with different rules has a different version without being told, and so a
  different key for the same request.
- The cache itself: a second identical request is a hit, two in flight share one run, an
  entry past its age or past the count is gone, and an answer with errors is never kept.
