# Cold first visit

Run `npm run bench:cold` to reproduce it. The raw results are in [cold-visit.json](cold-visit.json).

A first visit with nothing cached: the page downloads, registers the worker, the worker
downloads the catalog and the rules and builds the store, claims the page, and the shopper can
search. Each run is a fresh browser context against the production build served locally, so the
numbers leave out the network and show what the browser itself has to do.

| Recorded   | Commit    | Catalog (gzip) | Page (gzip) | Worker (gzip) |
| ---------- | --------- | -------------- | ----------- | ------------- |
| 2026-10-28 | `aa97459` | 333 KB         | 79 KB       | 65 KB         |

| Run    | Ready to search | Catalog and rules downloaded | Store built | First suggestion |
| ------ | --------------- | ---------------------------- | ----------- | ---------------- |
| 1      | 216 ms          | 38 ms                        | 55 ms       | 192 ms           |
| 2      | 214 ms          | 38 ms                        | 55 ms       | 190 ms           |
| 3      | 214 ms          | 37 ms                        | 55 ms       | 190 ms           |
| 4      | 211 ms          | 40 ms                        | 56 ms       | 191 ms           |
| 5      | 210 ms          | 38 ms                        | 55 ms       | 190 ms           |
| Median | 214 ms          | 38 ms                        | 55 ms       | 190 ms           |

"Ready to search" is measured from the start of navigation to the search box appearing, which
happens once the worker has claimed the page. The worker reports its own two timings. The first
suggestion is measured from typing to the first suggestion appearing, and includes the popover's
pause for the typing to stop.
