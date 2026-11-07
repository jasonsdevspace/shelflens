# @shelflens/storefront

The demo: the store's search as a shopper sees it, deployed to GitHub Pages with the API inside
the page.

- **The client is written here.** `src/client` sends typed documents, generated from the
  operations in `src/operations` and named at build time by the hash of their text. The page keeps
  the names and the types, and leaves the text to the API's manifest, since it never sends it. A
  named operation goes as a `GET` with its variables and the store version in the URL, so a cache
  can keep the answer under it. The client remembers answers too, on the API's one cache key, for a
  count and an age, in a memory the page holds and shares between viewers. Beside it are the
  latest-request helper, which gives each request a ticket, aborts the one before, and marks a
  late answer stale, and the clients of the rules path and of a visitor's catalog, whose refusals
  are read for the host's reason one way.
  [Decision record 7](../../docs/decisions/0007-a-client-of-our-own.md) explains why it is not
  Apollo or urql, and [decision record 8](../../docs/decisions/0008-one-cache-key.md) the key.
- **The first screen is in the page.** The build renders the strip, the masthead and the line for
  a store that is still starting into each page's HTML, from the same components the script draws,
  so the first paint is the page rather than a blank one, and nothing moves when the script takes
  over. A browser with JavaScript turned off sees the line that says the store needs it.
  [Decision record 16](../../docs/decisions/0016-the-first-screen-is-in-the-page.md) has the
  choices.
- **A product has a page of its own.** Opening a product shows where it sits in the categories,
  its brand, material and rating, its price as a range across its variants in the store's
  currency, what a guest pays beside a member price, a table of its colors, sizes and stock, and
  a rail of other products. The way back returns to the results with focus on the card just
  closed, or offers the store when the visit began on the product.
- **Explain mode.** A toggle on the results page, carried in the URL, that asks the API for the
  explanation it carries on every hit and says under each card why it ranked there: which word
  matched which term in which field, exactly, by prefix, by synonym or corrected, and which rule
  pinned, boosted or buried it. When a sort sets the merchandising aside, the page says so.
- **Rules are config.** `public/rules.json` is the merchandising the demo ships, loaded beside the
  catalog when the store is built and validated then: a rule of the wrong shape, or one that names
  a product or an attribute the store does not have, fails the build, in the worker, the Node
  server and the dev server alike. A test runs the shipped rules against the shipped catalog.
- **The search box as a widget.** `widget.js`, built beside the page, mounts the box into an
  element a host page hands over, inside a shadow root with its own sheet and its own React, and
  opens its list in the browser's top layer, over anything the host stacks or clips. The host
  says where the API and the store are, and can say what a search or a product does instead.
  The page at `widget/` is a host with unfriendly styles, a banner, a clipping box and a React of
  its own, to show the widget keeping its look and its place. Its prose is styled in
  `src/widget/page.css`, and what it throws at the widget is in `src/widget/host.css`.
  A page on another origin runs the Node server with that origin named, as the server's README
  says, and the browser test does it from a second origin.
  [Decision record 12](../../docs/decisions/0012-the-widget-keeps-its-own-tree.md) has the
  choices.
- **Search your own products.** The page at `try/`, in `src/try`, reads a CSV or JSON file of up
  to 10,000 products in the browser, guesses which column feeds each part of a product, and shows
  the first products as the store will before the same storefront searches them. Every guess can
  be corrected, and a file past the cap or not saved as UTF-8 is refused as it is read, with what
  to do. Nothing is uploaded.
  [Decision record 13](../../docs/decisions/0013-a-visitors-catalog-stays-in-the-browser.md) has
  the choices.
- **One set of tokens.** The design's values are the design kit's: its color roles, each holding its
  light and its dark value in one `light-dark()`, the type sizes, weights and line heights, the
  spacing steps, the corners, one raised shadow, one scrim and the focus ring, all under the `--dk-`
  prefix. `src/tokens.css` sets again what the store draws its own way, its colors and the width of
  a page of reading, and the widget's frame, which lives in a shadow root where the kit's sheets
  match nothing, takes everything it reads there. The store's pages take their base styles from the
  kit's `base.css` too: the page's type and line height, the border box, the focus ring, a heading's
  weight and line, and the cut to motion. The strip and the footer are the kit's, and so is the skip
  link on the pages written by hand. The store's pages draw the strip, with the demo's switches in
  it, and the footer from the kit's React components. The pages written by hand write the same
  markup, which a test holds to what the components draw. Every bordered button is the kit's, its
  `Button`, or its `.dk-button` on a link, a label or a button the page moves focus to. The one
  action a view asks for is its accent, and a step that goes nowhere is off rather than disabled, so
  a keyboard keeps its place on it. An action that reads as text is the store's own `.text-button`,
  always underlined. Every select is the kit's `.dk-select`, and the rule form draws its fields from
  the kit's `InputField` and `SelectField`, each problem said above its field and after any hint it
  has, which stays. The search box keeps a look of its own. A line the page sets apart, such as who
  is shopping, whose products these are, that edited rules are in effect or which rules a sort set
  aside, is the kit's `Callout`, and so is what failed to load, in its tone for something that went
  wrong. Each component otherwise wears classes of its own. The page picks each color by the saved
  theme and the widget by its host's color scheme. A test holds every sheet to the tokens, the
  store's palette to every pairing the kit measures, and the widget's frame to every name it reads,
  and a browser test holds every control on every page that is not off to an edge of 3 to 1, the one
  focus ring and, for a select, its caret, in both themes and on a phone.
- **What this browser searched before.** The box offers the phrases this browser searched
  before, filtered as you type, under a visible heading with a "Clear" button beside it. They
  are kept in local storage and never sent anywhere, so Global Privacy Control, which is about
  sharing, leaves them alone. A phrase joins the list only once its search found something, so
  a typo that found nothing is never offered again.
  [Decision record 11](../../docs/decisions/0011-recent-searches-are-page-state.md) has the
  choices.
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
- **Visits are counted by path.** `src/analytics.ts` starts Plausible's tracker, bundled from npm,
  from each of the demo's own pages and never from the widget's own file. It sets no cookie, and
  starts nothing when the browser sends Global Privacy Control, the check the events make in
  `src/privacy.ts`. Every address it sends is cut back to its path, keeping only a shared link's
  tags such as `utm_source` on the page's, and each page hands the next
  only the site's origin, so no search phrase leaves the browser.
  [Decision record 18](../../docs/decisions/0018-visits-are-counted-by-path.md) has the choices.
- **A page on how it works.** `about/index.html` is a second page in the build, static, sharing the
  store's sheet, the strip and the footer, and laid out as the design kit lays out an explainer: a
  header with the wordmark, the title and its lead, numbered sections and the steps of a search.
  It tells the same story as the README's two minutes and the tour in words a non-engineer can
  follow. A test holds its links to the README's steps and its stop count to the tour's, and a link
  from it into the store marks the tour seen, so the tour does not open over what the reader was
  sent to see.
- **The tour is the acceptance check.** `src/tour` is a panel that opens itself on a first visit, or
  on a phone a short bar that opens it on Start, and walks the gotchas the project exists to show,
  one stop each, with a link that puts the page in the state that shows it and the name of the test
  that proves it. A test checks every named test exists, and a reviewer can trigger every headline
  gotcha from it.
- **A reviewer can shop as a member.** The strip above the masthead has a switch between guest and
  member, with the demo's tour beside it, apart from what a shopper uses. The prices change and say
  so, a product only members may see appears and says so, one line under the toolbar says what the
  switch changed on the page, and nothing in the URL or the query asked for it: the viewer travels
  in a header, and every cache keys on it.
- **The URL is the page.** `src/app` holds the state every page reads from the query string:
  the phrase, the category, each facet, the sort, the page and the product being looked at.
  Parse and serialize are pure and tested. A filter is a history entry, so the back button
  undoes it, and a pasted link lands on the same page.
- **The results page reads one answer.** `src/results` renders the facets, the sort, the cards and
  the pages from a single search response, so they can never disagree. The facets count past their
  own filter, choosing "Red" never zeroes "Blue", and the category facet offers the children of
  wherever the shopper is, with the way up above it. The filters that are on show as chips under
  the heading, each removing itself, and the rating bands show the stars a card does. The tests run
  the whole page over the worker's handler, so the counts, the sort fallbacks and the pages are the
  real ones.
- **A phone gets the same page, laid out for it.** The facets become a drawer that is modal
  while open: focus starts on its close button, Tab cycles inside it, Escape and the backdrop
  close it, and focus returns to the button that opened it. The popover takes the width of the
  screen and no more height than the on-screen keyboard leaves.
- **The popover is a combobox.** `src/search` holds the search box, the suggestions hook with its
  debounce and minimum length, and the results list. The tests drive the popover against a
  network shim that answers requests out of order, and run an axe audit over it.
- **The API is a service worker.** `src/worker` builds the store from the shipped catalog during
  install, claims the page on activation, and answers `graphql`, `events` and `rules` under the
  site's path from inside the page, and a visitor's catalog too on the page for one, through the
  API's store host and its one `routeOf`. A failure of its own is a 500 in the API's shape, as the
  Node server answers. It accepts only the storefront's own operations, by name, caches answers on
  the API's one cache key, and keeps what the answer's headers allow in the Cache API under the
  answer's URL, since a response a worker makes up never enters the browser's own cache. Its handler
  is tested with plain fetch requests.
- **In development the dev server answers instead.** `src/dev/api-plugin.ts` is a Vite plugin that
  Node handler from `@shelflens/server` on the paths the Node server serves, over the same store
  host, so `npm run dev` needs no second process and no worker fighting hot reloading.
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
- **Lighthouse audits every page the demo serves.** `npm run lighthouse` runs in a CI job of its
  own, beside the browser tests, over the pages `src/bench/pages.ts` lists: the home page, a results
  page in explain mode, a category, a product, the explainer, the widget's host page, the page for a
  visitor's own catalog empty and with the sample loaded, and the widget's host page over that
  catalog. Each must score a hundred for accessibility, and on a first visit at least ninety for
  performance, with the largest paint inside two and a half seconds and a layout shift of no more
  than a tenth.
- **A real browser in CI.** `npm run e2e` builds the production page, serves it, and runs
  Playwright against it on a desktop and a phone profile with the service worker answering, with
  an axe audit of each page it reaches. Nothing is mocked.
- **Budgets.** `src/budgets.ts` holds each download's budget, compressed: the page under 104 KB, the
  page for a visitor's own catalog under 115 KB, the widget under 85 KB, the service worker under
  85 KB and the catalog under 400 KB. A test bundles each entry and generates the catalog, and
  `npm run budget` measures what the build ships. Both fail past a budget, on anything from GraphQL
  in a page or the widget, and on a test fixture in a script, and `npm run budget` also refuses a
  fixture in the catalog. The API package holds its browser bundle under 90 KB. Another test times
  every suggestion on the demo catalog and fails past the popover's share of its 150 ms budget, and
  `npm run bench:popover` records the measurement in
  [docs/benchmarks](../../docs/benchmarks/popover.md).

```bash
npm run dev          # the page with hot reloading, API answered by the dev server
npm run storefront   # the production build: page, catalog and worker, into dist/
npx vite preview     # from this directory, serves what was built
npm run e2e          # the browser tests, against that build
```

`BASE_PATH` sets the path the site is served under, `/shelflens/` on GitHub Pages.
