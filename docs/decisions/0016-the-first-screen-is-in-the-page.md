# 16. The first screen is in the page, drawn by the components the script uses

**Status:** accepted

## Context

The store's pages are a root element that a script fills. Until the script has downloaded and
run, the page is blank, and when it runs, the portfolio strip, the brand and the room for the
search box arrive together and push everything down. The first visit is the slowest, since the
worker installs, downloads the catalog and builds the store before the search box can appear
([record 6](0006-the-api-runs-in-the-browser.md)). A visitor who arrives from the portfolio
should see whose demo it is at once, and a browser with JavaScript turned off should be told why
nothing else comes.

## Options

**Leave the root empty until the script runs.** Nothing to keep in step. The page is blank for as
long as the script takes, and the strip and the masthead move the page when they appear.

**Write the first screen into each page's HTML by hand.** The strip and the brand show at once.
The markup is a second copy of the components, and the first change made to one copy and not the
other moves the page when the script takes over.

**Render the whole store at build time.** The products, counts and prices come from the worker in
the visitor's browser, under the visitor's saved rules, clicks and customer group, none of which
exist when the site is built. A page rendered at build time would show a store the worker does
not serve.

**Render the frame at build time, from the same components.** Only what does not depend on the
store: the strip, the masthead with the brand, and an empty content area with the line that says
the store is starting.

## Decision

The frame, rendered at build time from the components the script draws.

`firstScreen` in `packages/storefront/src/app/shell.tsx` renders `PageTop` and `Preparing` inside
the page's `main` with React's static renderer, for the store's page and for the page at `try/`.
The Vite plugin `pageShell` in `packages/storefront/src/dev/shell-plugin.ts` puts that markup in
place of the mark in each page's root. It loads the components through Vite, so they see the
site's base as the page does, once for a build and afresh for each page the dev server sends. The
script then mounts and draws the same markup over it, so nothing moves.

The store's masthead is drawn waiting. Its `is-waiting` class keeps, at each breakpoint, the
height the search box and the links beside the brand will take, so nothing below it moves when
they arrive. The page at `try/` has no search box in its masthead and keeps no room. The status
line in `main` is empty at first, says the store is being prepared after a moment, and says why a
first visit is slow after a few seconds more, so a usual start never flickers a line.

A `noscript` line inside `main` tells a browser with JavaScript turned off that the page needs it
and how to turn it on. The widget's host pages get a loading line where the search box mounts, with
a `noscript` line beside it, and their own sheet shows the loading line after the same pause and
takes it out when scripts are off. Another plugin puts the theme script in each page's head, so the
first screen paints in the theme the portfolio saved.

## Consequences

- The markup the script draws first has to equal the markup in the page exactly, or the page moves
  when the script takes over. A test holds the two equal for each page, so a change to the strip,
  the masthead or the status line that breaks this fails the tests.
- The masthead's waiting heights in `packages/storefront/src/styles.css` are measured, one for each
  breakpoint, and have to follow the masthead when the search box or its links change. The strip
  keeps the room the demo's own switches take beside its links in the same way, a field's height on
  a wide screen and a thumb's on a phone.
- React's static renderer runs only in the build and the dev server. Nothing in the page imports
  `shell.tsx`, so the page's bundle carries none of it.
- A page whose root asks for a first screen that has none written is refused by name at build
  time. The explainer at `about/` is plain HTML and has no root to fill.
- The script draws over the frame rather than hydrating it, so a difference between the two shows
  as movement, which the test and the layout shift gate catch, rather than as an error in the
  browser.

## How it is tested

- `packages/storefront/src/app/shell.test.tsx`: while the store is still starting, the store's
  first render is exactly `firstScreen('/index.html')` and the page at `try/` is exactly
  `firstScreen('/try/index.html')`. The page's markup carries the line for a browser without
  JavaScript, a page with no first screen is refused, and the status line says nothing, then that
  the store is being prepared, then why it is slow.
- `packages/storefront/src/App.start.test.tsx`: the masthead keeps its room only while the store is
  on its way, so a store that cannot start gives it up, and a masthead that is not the store's own
  keeps none.
- `packages/storefront/e2e/start.spec.ts`, with JavaScript turned off: the strip and the brand
  show on the store's page and on `try/`, each says what to do, and the widget's page takes out
  its loading line from its own sheet with no style in its head.
- `npm run lighthouse` in CI, on a first visit: every page scores at least ninety for performance,
  shifts its layout by no more than a tenth and paints its largest content within two and a half
  seconds (`packages/storefront/src/bench/lighthouse.ts`).
