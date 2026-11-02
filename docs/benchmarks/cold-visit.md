# Cold first visit

Run `npm run bench:cold` to reproduce it. The raw results are in [cold-visit.json](cold-visit.json).

A first visit with nothing cached: the page downloads, registers the worker, the worker
downloads the catalog and the rules and builds the store, claims the page, and the shopper can
search. Each run is a fresh browser context against the production build served locally, so the
numbers leave out the network and show what the browser itself has to do.

| Recorded   | Commit    | Machine                | Node     |
| ---------- | --------- | ---------------------- | -------- |
| 2026-11-02 | `8f45def` | Apple M2 Max, 12 cores | v24.22.2 |

What a first visit downloads, each as a server sends it:

| Catalog (gzip) | Page (gzip) | Worker (gzip) |
| -------------- | ----------- | ------------- |
| 332 KB         | 93 KB       | 74 KB         |

| Run    | Ready to search | Catalog and rules downloaded | Store built | First suggestion |
| ------ | --------------- | ---------------------------- | ----------- | ---------------- |
| 1      | 213 ms          | 38 ms                        | 52 ms       | 191 ms           |
| 2      | 209 ms          | 37 ms                        | 49 ms       | 190 ms           |
| 3      | 211 ms          | 38 ms                        | 50 ms       | 192 ms           |
| 4      | 208 ms          | 38 ms                        | 50 ms       | 189 ms           |
| 5      | 209 ms          | 40 ms                        | 50 ms       | 188 ms           |
| Median | 209 ms          | 38 ms                        | 50 ms       | 190 ms           |

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
| Laptop 1       | 145 ms           | 364 ms                       | 252 ms             | as measured     | 145 ms           |
| Laptop 2       | 144 ms           | 367 ms                       | 256 ms             | as measured     | 144 ms           |
| Laptop 3       | 149 ms           | 368 ms                       | 254 ms             | as measured     | 143 ms           |
| Laptop, median | 145 ms           | 367 ms                       | 254 ms             | as measured     | 144 ms           |
| Phone 1        | 561 ms           | 1016 ms                      | 244 ms             | 1750 ms         | 136 ms           |
| Phone 2        | 561 ms           | 1032 ms                      | 250 ms             | 1783 ms         | 140 ms           |
| Phone 3        | 571 ms           | 1023 ms                      | 242 ms             | 1749 ms         | 135 ms           |
| Phone, median  | 561 ms           | 1023 ms                      | 244 ms             | 1750 ms         | 136 ms           |

"Reading the file" is from picking it to the review being ready, and includes guessing the
mapping and making the whole catalog. "Pressing search to searching" includes sending the
catalog to the worker, its check, the build and the store's first page, as measured, with the
worker at full speed. The worker's share is its own work: reading the catalog it was sent, checking it, versioning it
and building the store, without the transfer of the file or any wait behind another build. Every
interval is marked by the page itself as it happens. The first suggestion includes the popover's pause for the typing to stop,
and on a phone its answer from the worker is not slowed either.
