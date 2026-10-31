# Changelog

The engine follows semantic versioning from its first release. Until 1.0.0, a minor version may
change the public types. Each version is published from a tag by the release workflow, with
provenance, and has a release on GitHub with the entry below as its notes.

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
