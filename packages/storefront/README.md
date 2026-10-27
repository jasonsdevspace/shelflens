# @shelflens/storefront

The demo: the store's search as a shopper sees it, deployed to GitHub Pages with the API inside
the page.

- **The client is written here.** `src/client` posts typed documents, generated as strings from
  the operations in `src/operations`, and holds the latest-request helper that gives each request
  a ticket, aborts the one before, and marks a late answer stale.
  [Decision record 7](../../docs/decisions/0007-a-client-of-our-own.md) explains why it is not
  Apollo or urql.
- **The popover is a combobox.** `src/search` holds the search box, the suggestions hook with its
  debounce and minimum length, and the results list. The tests drive the popover against a
  network shim that answers requests out of order, and run an axe audit over it.
- **The API is a service worker.** `src/worker` builds the store from the shipped catalog during
  install, claims the page on activation, and answers `POST /graphql` from inside the page. Its
  handler is tested with plain fetch requests.
- **In development the dev server answers instead.** `src/dev` is a Vite plugin that mounts the
  Node handler from `@shelflens/server` on `/graphql`, so `npm run dev` needs no second process
  and no worker fighting hot reloading.
- **Two budgets.** A test bundles the page and fails past 100 KB compressed or if anything from
  GraphQL is in it. Another times every suggestion on the demo catalog and fails past the
  popover's share of its 150 ms budget. `npm run bench:popover` records the measurement in
  [docs/benchmarks](../../docs/benchmarks/popover.md).

```bash
npm run dev          # the page with hot reloading, API answered by the dev server
npm run storefront   # the production build: page, catalog and worker, into dist/
npx vite preview     # from this directory, serves what was built
```

`BASE_PATH` sets the path the site is served under, `/shelflens/` on GitHub Pages.
