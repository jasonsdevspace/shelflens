# Changelog

The engine follows semantic versioning from its first release. Until 1.0.0, a minor version may
change the public types. Each version is published from a tag by the release workflow, with
provenance, and has a release on GitHub with the entry below as its notes, under a line that
names the package on npm and how to install that version once it is promoted.

## 0.6.0

A filter its attribute cannot take is refused, and the error codes have a type of their own.

- **A word for a number is refused.** A filter whose `eq` is a word, or any `in` filter, on a
  number or boolean attribute throws an `EngineError` with the code `wrong_attribute_kind`, as a
  range on a word or true or false on a word already did. It used to match nothing.
- **The error codes are a type.** `EngineErrorCode` is exported, and the code `unknown_field`,
  which nothing threw, is gone from it.
- **Every export says what it is.** Each published function and type has a doc comment on it.

Every search the engine still accepts returns the same results as in 0.5.0.

## 0.5.0

What a sort set aside of each rule, by name.

- **What each rule lost.** A result's `rules.setAside` lists each rule the sort set aside, in the
  order of `rules.setAsideBySort`, with its `name` when it has one and how many of its `pins`,
  `boosts` and `buries` gave way. Under a sort scoped to the rule's own filter its pins hold, so
  they count as none there, and a pin is counted only where the rule would have placed it under
  relevance, so a product an earlier rule pinned or a rule hides is not counted. A rule that would
  have placed nothing and has no boost or bury is not listed. The type is exported as `SetAside`.

`rules.setAsideBySort` lists the ids of `rules.setAside`, so a rule that would have placed nothing
leaves it too, and it is deprecated in favor of `rules.setAside`. Every search returns the same
results as in 0.4.1.

## 0.4.1

The same results as 0.4.0, reported fully under a category's own sort, with the package's page
saying what it exports.

- **Set-aside boosts are reported.** Under a sort scoped to a rule's own filter, such as a
  category's position, a rule keeps its pins and hides, and its boosts and buries do nothing, as
  in 0.4.0. Such a rule is now listed in `setAsideBySort` as well, so a page can say why its boosts
  and buries did nothing. A rule that only boosts or buries is listed there alone and no longer in
  `applied`.
- **What it exports.** The README lists every value and type the package exports.

## 0.4.0

The same results as 0.3.0, for less work, and on an older Node.

- **Node 22 or later.** `engines.node` is `>=22`, where it was `>=24`, and the packed engine is
  tested on Node 22.0.0 before each release.
- **Faster wide searches.** On a hundred thousand products, a two-letter prefix with every facet
  takes about a third of the time it did at the median, and browsing everything under a fifth.
  Facets count keyword values by a code per value rather than by string, a page orders only the
  matches up to its last result rather than all of them, and a search no rule or signal touches
  leaves the scores alone.
- **Faster indexing.** Postings are appended in place and each text is normalized once, so a
  hundred thousand products index in about five sixths of the time.
- **A little more memory.** The index holds each value of a faceted keyword attribute as a code,
  about five megabytes more at a hundred thousand products.

On the same Node, every search returns what it did in 0.3.0, in the same order with the same
scores, facets and explanations. One order is now settled where it was not: a score that is not a
number, as a boost of `Infinity` on a score of zero gives, sorts last either way, where 0.3.0 left
its place to the sort. Accent folding uses the Unicode data of the Node it runs on, so on Node 22
a rare character may fold as that Node's data says.

## 0.3.0

Two changes to how a search is ordered, so a sort only reorders what relevance would show.

- **A hide holds under every sort.** A rule's hides say what may be shown, not where, so a sort
  other than relevance no longer sets them aside. Only pins, boosts and buries are, as before.
  A rule that hides is reported in `rules.applied` under any sort, and one that also pins, boosts
  or buries is in `rules.setAsideBySort` as well.
- **`id` is a sort.** `{ by: 'id' }` orders by the order the documents were indexed in, either way,
  where it used to be refused as an unknown attribute. It is the sort already used when browsing
  without a query or a scope. A config that declares an attribute named `id` sorts by that
  attribute instead.

## 0.2.1

The same engine as 0.2.0. The README now links a
[page to try it on your own products](https://jasonsdevspace.com/shelflens/try/), where the live
storefront searches a CSV or JSON file in your browser before you install anything. Nothing in
the code changed.

## 0.2.0

- Signals: `EngineConfig.signals` names how often each document was chosen, and a chosen
  document's relevance score is multiplied by a bounded weight, from one up to a cap of 1.25 at a
  hundred choices, rising with the log of the count. The cap sits below the smallest boost a
  merchandiser would write, and a document a rule pinned or buried takes no signal at all, so
  the crowd never moves what a merchandiser placed. `reconfigure` takes `signals` as it takes
  rules.
- Every hit that was raised carries `signal`, the count and the weight, for explain mode.
- `signalWeight`, `SIGNAL_CAP` and `SIGNAL_SATURATION` are exported, so a host can show what a
  count would do.

## 0.1.1

The same engine as 0.1.0, published by the release workflow from a tag on main, with provenance
linking the package to the commit and the run that built it. Nothing in the code changed.

## 0.1.0

The first release.

- One normalization for the catalog and the query: case and accents folded, hyphenated words in
  both forms, plurals reduced.
- Every word must match, in any field, with field weights. Exact first, then one typo per word.
  The last word can be a prefix, for search as you type.
- Synonyms rewrite phrases of the query, scored per typed word.
- Filters on keyword, number and boolean attributes. Sorts on any attribute or relevance, each
  clause breaking the ties of the one before, and every sort ending on the id. Sorts scoped to a
  filter fall back when the filter is absent.
- Facets that count past their own filter: keyword, range and stats.
- Merchandising rules that pin, boost, bury and hide, for queries or inside a filter, with time
  windows, checked at startup and set aside under any sort but relevance.
- An explanation on every hit, and a recovery for a search that found nothing.
