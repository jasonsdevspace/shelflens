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
| 2026-11-02 | `0963ca6` | Apple M2 Max, 12 cores | v24.3.0 |

Each time is shown as measured on the laptop and then slowed for a phone, which is the number held
to the budget.

| Products | Catalog (uncompressed) | Start     | On a phone | Suggest p95 | On a phone | Search p95 | On a phone | Fits a phone |
| -------- | ---------------------- | --------- | ---------- | ----------- | ---------- | ---------- | ---------- | ------------ |
| 2000     | 3.6 MB                 | 78.91 ms  | 315.64 ms  | 0.79 ms     | 3.16 ms    | 0.47 ms    | 1.88 ms    | yes          |
| 5000     | 8.9 MB                 | 149.13 ms | 596.52 ms  | 1.76 ms     | 7.04 ms    | 0.69 ms    | 2.76 ms    | yes          |
| 10000    | 17.8 MB                | 310.32 ms | 1241.28 ms | 3.41 ms     | 13.64 ms   | 1.1 ms     | 4.4 ms     | yes          |
| 25000    | 44.7 MB                | 761.18 ms | 3044.72 ms | 9.52 ms     | 38.08 ms   | 2.74 ms    | 10.96 ms   | no           |

The largest size that fits, with every smaller one fitting too, is 10000 products,
and that is the cap on a visitor's catalog.
