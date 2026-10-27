# 4. Facets count past their own filter

**Status:** accepted

## Context

A facet shows a shopper what they could filter by next, with a count beside each choice. The
counts have to answer the right question. After selecting "Red", the color facet that counts only
red products shows "Blue: 0", and the shopper can never widen the selection without first
clearing it. Every working storefront avoids that, and the way it does so has a cost.

## Options

**A. Conjunctive counts.** Every facet is counted over the documents that pass every filter. One
pass over the candidates serves all facets. The facet a shopper just used collapses to the value
they chose.

**B. Disjunctive counts per facet.** Each facet is counted over the documents that pass every
filter except those on its own attribute. Selecting "Red" leaves the color facet counting all
colors, while still narrowing the brand facet. This is what shoppers expect.

**C. Precomputed bitmaps.** A bit set per attribute value, intersected per facet. Fastest at
query time, at the cost of building and holding a bitmap per value per attribute.

## Decision

Option B, computed on the fly.

- **One pass set is shared.** The filters are evaluated once per candidate. A facet with no
  filter on its own attribute uses that set as it is. Only a facet the shopper has filtered on
  gets a pass set of its own, with its filters left out. In practice that is one or two facets.
- **The counts are over the query's candidates**, including pinned products and excluding hidden
  ones, so the facets describe exactly the list the shopper is looking at.
- **Keyword values are counted once per document**, however many times a document carries the
  same value.

## Consequences

- On the benchmark catalog, counting eight facets over a hundred thousand candidates is about half
  of a wide query's time, roughly 45 of 93 milliseconds. On the demo catalog it is not
  measurable. If a catalog needed it, option C is the step up, and the facet interface would not
  change.
- A range facet counts each document into every band it falls in, so overlapping bands such as
  "4 and up" and "3 and up" both count a product rated 4.5. That is a feature of the config, not
  a quirk.
- A stats facet with no values reports a count of zero and no bounds, rather than infinities.

## How it is tested

- A test selects "Red" and asserts the color facet still counts Blue and Black, then adds a brand
  filter and asserts the color facet narrows. Removing the own-filter exemption fails it.
- The exclusive upper bound of a range, and the cap on keyword values.
- The benchmark reports every query with every facet counted.
