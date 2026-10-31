# Cold first visit

Run `npm run bench:cold` to reproduce it. The raw results are in [cold-visit.json](cold-visit.json).

A first visit with nothing cached: the page downloads, registers the worker, the worker
downloads the catalog and the rules and builds the store, claims the page, and the shopper can
search. Each run is a fresh browser context against the production build served locally, so the
numbers leave out the network and show what the browser itself has to do.

| Recorded   | Commit    | Catalog (gzip) | Page (gzip) | Worker (gzip) |
| ---------- | --------- | -------------- | ----------- | ------------- |
| 2026-10-31 | `8a446bf` | 333 KB         | 90 KB       | 72 KB         |

| Run    | Ready to search | Catalog and rules downloaded | Store built | First suggestion |
| ------ | --------------- | ---------------------------- | ----------- | ---------------- |
| 1      | 216 ms          | 38 ms                        | 57 ms       | 192 ms           |
| 2      | 213 ms          | 39 ms                        | 58 ms       | 191 ms           |
| 3      | 213 ms          | 38 ms                        | 59 ms       | 191 ms           |
| 4      | 213 ms          | 38 ms                        | 58 ms       | 190 ms           |
| 5      | 211 ms          | 39 ms                        | 59 ms       | 191 ms           |
| Median | 213 ms          | 38 ms                        | 58 ms       | 191 ms           |

"Ready to search" is measured from the start of navigation to the search box appearing, which
happens once the worker has claimed the page. The worker reports its own two timings. The first
suggestion is measured from typing to the first suggestion appearing, and includes the popover's
pause for the typing to stop.

## A visitor's catalog at the cap

The page at `try/` with a file of 10,000 products, the cap,
written as the sample is and 3.3 MB as a CSV. Each run is a fresh
browser: the file is picked, read and mapped in the page, then search is pressed and the catalog
goes to the page's own worker, which checks it and builds the store. "Laptop" is the machine as
it is. "Phone" slows the processor 4 times, as Lighthouse slows it for mobile, but a browser
can slow only the page and not its worker, so the worker times its own share and the wait on a
phone scales that share too. The cap was chosen for a phone to start its store within two
seconds, and that column is the wait.

| Run            | Reading the file | Pressing search to searching | The worker's share | Wait on a phone | First suggestion |
| -------------- | ---------------- | ---------------------------- | ------------------ | --------------- | ---------------- |
| Laptop 1       | 131 ms           | 406 ms                       | 301 ms             | as measured     | 165 ms           |
| Laptop 2       | 132 ms           | 413 ms                       | 305 ms             | as measured     | 165 ms           |
| Laptop 3       | 133 ms           | 411 ms                       | 303 ms             | as measured     | 162 ms           |
| Laptop, median | 132 ms           | 411 ms                       | 303 ms             | as measured     | 165 ms           |
| Phone 1        | 520 ms           | 964 ms                       | 304 ms             | 1874 ms         | 138 ms           |
| Phone 2        | 538 ms           | 970 ms                       | 300 ms             | 1870 ms         | 136 ms           |
| Phone 3        | 528 ms           | 970 ms                       | 314 ms             | 1911 ms         | 137 ms           |
| Phone, median  | 528 ms           | 970 ms                       | 304 ms             | 1874 ms         | 137 ms           |

"Reading the file" is from picking it to the review being ready, and includes guessing the
mapping and making the whole catalog. "Pressing search to searching" includes sending the
catalog to the worker, its check, the build and the store's first page, as measured, with the
worker at full speed. The worker's share is its own work: reading the catalog it was sent, checking it, versioning it
and building the store, without the transfer of the file or any wait behind another build. Every
interval is marked by the page itself as it happens. The first suggestion includes the popover's pause for the typing to stop,
and on a phone its answer from the worker is not slowed either.
