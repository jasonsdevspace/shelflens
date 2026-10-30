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
- **Rules can be written in the page.** "Rules" on the results page opens a panel with the rules
  that apply to the search, and a form for one at a time: pin, boost, bury or hide a product from
  the page or a brand from the facet, with the weight as named steps. The results beside the
  panel are a preview from the engine with the draft in place, volatile so no cache keeps it.
  Saving posts the whole set to the `rules` path beside `graphql`, the worker keeps it in
  IndexedDB and builds the store again under a new version, and every page says the edited set is
  in effect until the store's own rules are asked for back.
  [Decision record 10](../../docs/decisions/0010-rules-live-in-the-browser.md) has the choices.
- **Nothing is still a page.** When a search finds nothing, the API says what would find
  something, and the page shows it: a phrase a typo or two away, a shorter phrase with its
  results, the same phrase without the filters, and the most rated products as a last resort.
  Each is one click away, and each changes the URL like anything else.
- **A page on how it works.** `about/index.html` is a second page in the build, static, sharing
  the stylesheet, the strip and the footer, that tells the same story as the README's two minutes
  and the tour in words a non-engineer can follow. A test holds its links to the README's steps
  and its stop count to the tour's, and a link from it into the store marks the tour seen, so
  the tour does not open over what the reader was sent to see.
- **The tour is the acceptance check.** `src/tour` is a panel that opens itself on a first visit
  and walks the gotchas the project exists to show, one stop each, with a link that puts the page
  in the state that shows it and the name of the test that proves it. A test checks every named
  test exists. The brief's exit check for Release 1 is that a reviewer can trigger every
  headline gotcha from the tour.
- **A reviewer can shop as a member.** The masthead has a switch between guest and member. The
  prices change and say so, a product only members may see appears and says so, one line under
  the toolbar says what the switch changed on the page, and nothing in the URL or the query
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
- **Deployed by CI.** Once every check has passed on main, the workflow builds the page, the
  catalog, the rules and the worker for the path the project site is served under and publishes
  them to GitHub Pages at jasonsdevspace.com/shelflens/. A merge that fails a check is never
  deployed. A returning visitor's page reloads once when a new worker takes over, so the page and
  the worker answering it are from the same build, and a page that bypassed the worker, as a hard
  reload does, asks it to take charge.
- **The cold first visit is measured.** `npm run bench:cold` visits the production build in a
  fresh browser, records when the page was ready to search, how long the worker spent downloading
  the catalog and building the store, and how long the first suggestion took, and writes it to
  [docs/benchmarks](../../docs/benchmarks/cold-visit.md).
- **Lighthouse scores a hundred for accessibility**, on the home page, a results page in explain
  mode, a category and a product, checked in CI by `npm run lighthouse` after the browser tests.
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
