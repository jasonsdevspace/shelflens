# Cold first visit

Run `npm run bench:cold` to reproduce it. The raw results are in [cold-visit.json](cold-visit.json).

A first visit with nothing cached: the page downloads, registers the worker, the worker
downloads the catalog and the rules and builds the store, claims the page, and the shopper can
search. Each run is a fresh browser context against the production build served locally, so the
numbers leave out the network and show what the browser itself has to do.

| Recorded   | Commit    | Catalog (gzip) | Page (gzip) | Worker (gzip) |
| ---------- | --------- | -------------- | ----------- | ------------- |
| 2026-10-31 | `42519c0` | 333 KB         | 0 KB        | 72 KB         |

| Run    | Ready to search | Catalog and rules downloaded | Store built | First suggestion |
| ------ | --------------- | ---------------------------- | ----------- | ---------------- |
| 1      | 215 ms          | 37 ms                        | 55 ms       | 195 ms           |
| 2      | 211 ms          | 39 ms                        | 55 ms       | 193 ms           |
| 3      | 210 ms          | 36 ms                        | 55 ms       | 190 ms           |
| 4      | 212 ms          | 38 ms                        | 56 ms       | 190 ms           |
| 5      | 211 ms          | 38 ms                        | 56 ms       | 190 ms           |
| Median | 211 ms          | 38 ms                        | 55 ms       | 190 ms           |

"Ready to search" is measured from the start of navigation to the search box appearing, which
happens once the worker has claimed the page. The worker reports its own two timings. The first
suggestion is measured from typing to the first suggestion appearing, and includes the popover's
pause for the typing to stop.

## A visitor's catalog at the cap

The page at `try/` with a file of 10,000 products, the cap,
written as the sample is and 3.3 MB as a CSV. Each run is a fresh
browser: the file is picked, read and mapped in the page, then search is pressed and the catalog
goes to the page's own worker, which checks it and builds the store. "Laptop" is the machine as
it is. "Phone" slows the processor four times, as Lighthouse slows it for mobile, but a browser
can slow only the page and not its worker, so the worker times its own share and the wait on a
phone scales that share too. The cap was chosen for a phone to start its store within two
seconds, and that column is the wait.

| Run            | Reading the file | Pressing search to searching | The worker's share | Wait on a phone | First suggestion |
| -------------- | ---------------- | ---------------------------- | ------------------ | --------------- | ---------------- |
| Laptop 1       | 169 ms           | 482 ms                       | 315 ms             | as measured     | 185 ms           |
| Laptop 2       | 169 ms           | 483 ms                       | 318 ms             | as measured     | 184 ms           |
| Laptop 3       | 169 ms           | 486 ms                       | 319 ms             | as measured     | 181 ms           |
| Laptop, median | 169 ms           | 483 ms                       | 318 ms             | as measured     | 184 ms           |
| Phone 1        | 608 ms           | 1016 ms                      | 321 ms             | 1979 ms         | 242 ms           |
| Phone 2        | 590 ms           | 1008 ms                      | 328 ms             | 1991 ms         | 218 ms           |
| Phone 3        | 591 ms           | 1022 ms                      | 321 ms             | 1985 ms         | 250 ms           |
| Phone, median  | 591 ms           | 1016 ms                      | 321 ms             | 1985 ms         | 242 ms           |

"Reading the file" is from picking it to the review being ready, and includes guessing the
mapping and making the whole catalog. "Pressing search to searching" includes sending the
catalog to the worker, its check, the build and the store's first page, as measured, with the
worker at full speed. The worker's share is reading the catalog it was sent, checking it and
building the store. The first suggestion includes the popover's pause for the typing to stop,
and on a phone its answer from the worker is not slowed either.
