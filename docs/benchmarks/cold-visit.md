# Cold first visit

Run `npm run bench:cold` to reproduce it. The raw results are in [cold-visit.json](cold-visit.json).

A first visit with nothing cached: the page downloads, registers the worker, the worker
downloads the catalog and the rules and builds the store, claims the page, and the shopper can
search. Each run is a fresh browser context against the production build served locally, so the
numbers leave out the network and show what the browser itself has to do.

| Recorded   | Commit    | Catalog (gzip) | Page (gzip) | Worker (gzip) |
| ---------- | --------- | -------------- | ----------- | ------------- |
| 2026-10-28 | `2612da7` | 333 KB         | 79 KB       | 65 KB         |

| Run    | Ready to search | Catalog and rules downloaded | Store built | First suggestion |
| ------ | --------------- | ---------------------------- | ----------- | ---------------- |
| 1      | 222 ms          | 40 ms                        | 58 ms       | 192 ms           |
| 2      | 210 ms          | 37 ms                        | 54 ms       | 189 ms           |
| 3      | 210 ms          | 38 ms                        | 55 ms       | 191 ms           |
| 4      | 210 ms          | 38 ms                        | 55 ms       | 190 ms           |
| 5      | 211 ms          | 38 ms                        | 55 ms       | 191 ms           |
| Median | 210 ms          | 38 ms                        | 55 ms       | 191 ms           |

"Ready to search" is measured from the start of navigation to the search box appearing, which
happens once the worker has claimed the page. The worker reports its own two timings. The first
suggestion is measured from typing to the suggestions appearing, and includes the popover's
pause for the typing to stop.
