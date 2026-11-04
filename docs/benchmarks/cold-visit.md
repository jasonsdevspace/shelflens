# Cold first visit

Run `npm run bench:cold` to reproduce it. The raw results are in [cold-visit.json](cold-visit.json).

A first visit with nothing cached: the page downloads, registers the worker, the worker
downloads the catalog and the rules and builds the store, claims the page, and the shopper can
search. Each run is a fresh browser context against the production build served locally, so the
numbers leave out the network and show what the browser itself has to do.

| Recorded   | Commit    | Machine                | Node     |
| ---------- | --------- | ---------------------- | -------- |
| 2026-11-04 | `2d919c0` | Apple M2 Max, 12 cores | v24.22.2 |

What a first visit downloads, each as a server sends it:

| Catalog (gzip) | Page (gzip) | Worker (gzip) |
| -------------- | ----------- | ------------- |
| 332 KB         | 99 KB       | 76 KB         |

| Run    | Ready to search | Catalog and rules downloaded | Store built | First suggestion |
| ------ | --------------- | ---------------------------- | ----------- | ---------------- |
| 1      | 216 ms          | 40 ms                        | 44 ms       | 192 ms           |
| 2      | 211 ms          | 37 ms                        | 42 ms       | 192 ms           |
| 3      | 210 ms          | 41 ms                        | 43 ms       | 190 ms           |
| 4      | 209 ms          | 38 ms                        | 44 ms       | 188 ms           |
| 5      | 211 ms          | 39 ms                        | 43 ms       | 192 ms           |
| Median | 211 ms          | 39 ms                        | 43 ms       | 192 ms           |

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
| Laptop 1       | 148 ms           | 383 ms                       | 252 ms             | as measured     | 147 ms           |
| Laptop 2       | 147 ms           | 382 ms                       | 251 ms             | as measured     | 148 ms           |
| Laptop 3       | 149 ms           | 385 ms                       | 251 ms             | as measured     | 148 ms           |
| Laptop, median | 148 ms           | 383 ms                       | 251 ms             | as measured     | 148 ms           |
| Phone 1        | 562 ms           | 1036 ms                      | 222 ms             | 1702 ms         | 134 ms           |
| Phone 2        | 571 ms           | 1039 ms                      | 215 ms             | 1686 ms         | 135 ms           |
| Phone 3        | 565 ms           | 1027 ms                      | 219 ms             | 1683 ms         | 136 ms           |
| Phone, median  | 565 ms           | 1036 ms                      | 219 ms             | 1686 ms         | 135 ms           |

"Reading the file" is from picking it to the review being ready, and includes guessing the
mapping and making the whole catalog. "Pressing search to searching" includes sending the
catalog to the worker, its check, the build and the store's first page, as measured, with the
worker at full speed. The worker's share is its own work: reading the catalog it was sent, checking it, versioning it
and building the store, without the transfer of the file or any wait behind another build. Every
interval is marked by the page itself as it happens. The first suggestion includes the popover's pause for the typing to stop,
and on a phone its answer from the worker is not slowed either.
