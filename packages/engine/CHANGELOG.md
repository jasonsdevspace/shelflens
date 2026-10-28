# Changelog

The engine follows semantic versioning from its first release. Until 1.0.0, a minor version may
change the public types.

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
