# Catalog size benchmark

Run `npm run bench:sizes` to reproduce it. The raw results are in
[catalog-size.json](catalog-size.json).

A visitor can search their own catalog, and this says how large it can be. Each size is the
[popover benchmark](popover.md) run over a generated catalog of that many products: starting the
store once, then every prefix of every golden query as a suggestion and every golden query as a
search. A visitor may be on a phone, so each time is slowed 4 times, as
Lighthouse slows the processor for mobile. A size fits when, slowed, suggestions and searches
answer within 50 ms at the 95th percentile and the store starts within
2 seconds, the one wait after loading a file.

| Recorded   | Commit    | Machine                | Node    |
| ---------- | --------- | ---------------------- | ------- |
| 2026-10-31 | `36e181d` | Apple M2 Max, 12 cores | v24.3.0 |

Each time is shown as measured on the laptop and then slowed for a phone, which is the number held
to the budget.

| Products | Catalog (uncompressed) | Start     | On a phone | Suggest p95 | On a phone | Search p95 | On a phone | Fits a phone |
| -------- | ---------------------- | --------- | ---------- | ----------- | ---------- | ---------- | ---------- | ------------ |
| 2000     | 3.6 MB                 | 81.1 ms   | 324.4 ms   | 0.81 ms     | 3.24 ms    | 0.68 ms    | 2.72 ms    | yes          |
| 5000     | 8.9 MB                 | 163.18 ms | 652.72 ms  | 1.78 ms     | 7.12 ms    | 0.88 ms    | 3.52 ms    | yes          |
| 10000    | 17.8 MB                | 313.86 ms | 1255.44 ms | 3.58 ms     | 14.32 ms   | 1.2 ms     | 4.8 ms     | yes          |
| 25000    | 44.8 MB                | 813.97 ms | 3255.88 ms | 9.94 ms     | 39.76 ms   | 2.78 ms    | 11.12 ms   | no           |

The largest size that fits, with every smaller one fitting too, is 10000 products,
and that is the cap on a visitor's catalog.
