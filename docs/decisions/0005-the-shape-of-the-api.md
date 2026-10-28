# 5. The shape of the API

**Status:** accepted

## Context

The storefront talks to the search through GraphQL, and the schema is the contract: the popover,
the results page and the explain mode are written against it, and the types on both sides are
generated from it. Getting it wrong costs every milestone after this one, so it is written and
reviewed before any resolver exists.

The schema follows what a product search API has to do, with the project's own names. Nothing is
copied from any vendor's schema.

## The decisions in it

**The viewer comes from the request, not the query.** A customer group changes prices and, for
some products, the catalog. If a query could name a group, any caller could ask for any group's
prices. The group is read from the request, the way a session would be, and `store.viewer`
reports it. Every price in a response is the viewer's price, and there is no other price to ask
for.

**Facets are an interface with three types, not a union and not one flat type.** A keyword
facet has value buckets, a range facet has banded buckets, and a stats facet has bounds. One flat
type would carry every field as nullable and leave the client guessing which apply. A union would
force a fragment even to read the facet's name. An interface gives `name` and `attribute` without
a fragment and the buckets with one, which is what each facet type needs and nothing more.

**Filters take an enum of attributes and one matcher.** A client that misspells an attribute gets
a validation error from the schema, not a 500 or an empty result, and the matcher is a `@oneOf`
input so exactly one of equal, any-of or range is given. The same enum names the facets'
attributes, so a facet's bucket can be turned into a filter without a lookup table.

**The engine's words are translated, not exposed.** The engine says `fuzzy`, the API says
`CORRECTED`. The engine says `none`, the API says `NONE` beside `ALL`, because an empty phrase that
matched everything and a phrase that matched nothing are different answers. Sort fields are an
enum, and `PRICE` resolves to the viewer's price attribute on the server, so the client never
learns that two price attributes exist.

**Money is an integer in minor units with a currency.** Formatting is a locale decision the client
makes with the store's locale, so the API never carries a formatted string that one client wanted
and another has to parse.

**The catalog version is in the schema.** `store.catalogVersion` changes whenever the catalog or
the rules change, so a client can put it in every cache key. That is what lets a cache be aggressive
and still never serve a stale price after an update.

**A page past the end is empty, and a page size past the limit is reduced.** Both are stated in
the schema's descriptions, so a client knows without trying.

**Nothing is an answer with a shape.** `SearchResult.noResults` is null unless the search found
nothing, and then carries what would find something: a spelling, a shorter phrase with its own
result, what the same phrase finds without its filters, and the most rated products. Each part is
resolved only when a client asks for it.

**Explanations are part of the hit.** `SearchHit.explanation` carries each matched word, its
route and its score, and each rule that touched the result. Explain mode is the same search with
one variable flipped: the storefront's operation includes the explanation and the score only when
asked, so a results page pays for them only while a reviewer is looking.

## Consequences

- Adding a filterable attribute means adding an enum value, which is a schema change a client
  sees, rather than a string a client could pass and get nothing for.
- Three facet types means three fragments in a client that wants buckets. The generated types
  make that mechanical.
- The suggest query returns products as search hits, with explanations, so the popover can show
  why a suggestion appeared with no second shape to learn.

## How it is tested

- The schema builds, and every type it names is defined, in a test that runs on every build.
- The generated server types are committed, and a check fails if the schema and the generated
  output disagree.
- Validation tests send each malformed request and assert the error is a validation error with
  a code rather than a failure.
