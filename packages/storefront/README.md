# @shelflens/storefront

The demo: the store's search as a shopper sees it, deployed to GitHub Pages with the API inside
the page.

- **The client is written here.** `src/client` sends typed documents, generated as strings from
  the operations in `src/operations` and named at build time by the hash of their text. A named
  operation goes as a `GET` with its variables and the store version in the URL, so a cache can
  keep the answer under it. The client remembers answers too, on the API's one cache key, for a
  count and an age, in a memory the page holds and shares between viewers. Beside it is the
  latest-request helper
  that gives each request a ticket, aborts the one before, and marks a late answer stale.
  [Decision record 7](../../docs/decisions/0007-a-client-of-our-own.md) explains why it is not
  Apollo or urql, and [decision record 8](../../docs/decisions/0008-one-cache-key.md) the key.
- **Explain mode.** A toggle on the results page, carried in the URL, that asks the API for the
  explanation it carries on every hit and says under each card why it ranked there: which word
  matched which term in which field, exactly, by prefix, by synonym or corrected, and which rule
  pinned, boosted or buried it. When a sort sets the merchandising aside, the page says so.
- **Rules are config.** `public/rules.json` is the merchandising the demo ships, loaded beside the
  catalog when the store is built and validated then: a rule that names a product or an attribute
  the store does not have fails the build, in the worker, the Node server and the dev server
  alike. A test runs the shipped rules against the shipped catalog.
- **A reviewer can shop as a member.** The masthead has a switch between guest and member. The
  prices change, a product only members may see appears, and nothing in the URL or the query
  asked for it: the viewer travels in a header, and every cache keys on it.
- **The URL is the page.** `src/app` holds the state every page reads from the query string:
  the phrase, the category, each facet, the sort, the page and the product being looked at.
  Parse and serialize are pure and tested. A filter is a history entry, so the back button
  undoes it, and a pasted link lands on the same page.
- **The results page reads one answer.** `src/results` renders the facets, the sort, the cards
  and the pages from a single search response, so they can never disagree. The facets count past
  their own filter, choosing "Red" never zeroes "Blue", and the category facet offers the
  children of wherever the shopper is. The tests run the whole page over the worker's handler,
  so the counts, the sort fallbacks and the pages are the real ones.
- **A phone gets the same page, laid out for it.** The facets become a drawer that is modal
  while open: focus starts on its close button, Tab cycles inside it, Escape and the backdrop
  close it, and focus returns to the button that opened it. The popover takes the width of the
  screen and no more height than the on-screen keyboard leaves.
- **The popover is a combobox.** `src/search` holds the search box, the suggestions hook with its
  debounce and minimum length, and the results list. The tests drive the popover against a
  network shim that answers requests out of order, and run an axe audit over it.
- **The API is a service worker.** `src/worker` builds the store from the shipped catalog during
  install, claims the page on activation, and answers `graphql` under the site's path from inside
  the page. It accepts only the storefront's own operations, by name, caches answers on the API's
  one cache key, and keeps what the answer's headers allow in the Cache API under the answer's
  URL, since a response a worker makes up never enters the browser's own cache. Its handler is
  tested with plain fetch requests.
- **In development the dev server answers instead.** `src/dev` is a Vite plugin that mounts the
  Node handler from `@shelflens/server` on `/graphql`, so `npm run dev` needs no second process
  and no worker fighting hot reloading.
- **A real browser in CI.** `npm run e2e` builds the production page, serves it, and runs
  Playwright against it on a desktop and a phone profile with the service worker answering, with
  an axe audit of each page it reaches. Nothing is mocked.
- **Two budgets.** A test bundles the page and fails past 100 KB compressed or if anything from
  GraphQL is in it. Another times every suggestion on the demo catalog and fails past the
  popover's share of its 150 ms budget. `npm run bench:popover` records the measurement in
  [docs/benchmarks](../../docs/benchmarks/popover.md).

```bash
npm run dev          # the page with hot reloading, API answered by the dev server
npm run storefront   # the production build: page, catalog and worker, into dist/
npx vite preview     # from this directory, serves what was built
npm run e2e          # the browser tests, against that build
```

`BASE_PATH` sets the path the site is served under, `/shelflens/` on GitHub Pages.
