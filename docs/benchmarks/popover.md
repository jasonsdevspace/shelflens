# Popover benchmark

Run `npm run bench:popover` to reproduce it. The raw results are in [popover.json](popover.json).

Results must be visible within 150 ms of the last keystroke. The search box waits 100 ms for the
typing to pause before it asks, so the API has 50 ms to answer a suggestion. These numbers are
the API answering in the same process, which is what the service worker does: the request is
real, but there is no server and no network between the page and the answer.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| 2026-10-29 | `5862173` | Apple M2 Max, 12 cores | v24.3.0 |

## Starting the store

The worker does this once, when it installs: read the catalog it downloaded and build the index
and the completions from it.

| Products | Catalog (uncompressed) | Parse   | Build    |
| -------- | ---------------------- | ------- | -------- |
| 2000     | 3.6 MB                 | 8.99 ms | 65.05 ms |

## Answering

Every prefix of every golden query, from the second character on, as a suggestion request with
the queries and five products. And every golden query as a search for the first page with its
facets, which is what Enter asks for.

| Request                        | Samples | p50     | p95     | Max     |
| ------------------------------ | ------- | ------- | ------- | ------- |
| Suggest, while typing          | 2600    | 0.21 ms | 0.85 ms | 3.2 ms  |
| Search, first page with facets | 340     | 0.33 ms | 0.48 ms | 2.44 ms |
