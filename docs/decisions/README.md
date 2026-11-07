# Decision records

The decisions in this project that had a real alternative, with the option rejected, what the
choice costs, and the test or measurement behind it. Records 1 to 15 and 18 were written when the
decision was made, so the evidence was still fresh. Records 16, 17 and 19 were written after the
work they describe, from the code, its tests and the pull requests that made it.

1. [An engine of our own, rather than a library](0001-an-engine-of-our-own.md): the parts a
   library hides are the parts the project exists to show.
2. [Flat arrays for the index](0002-flat-arrays-for-the-index.md): from 979 MB and a third of a
   second to 84 MB and a tenth, then a thirtieth and under a fiftieth, measured by the same
   benchmark.
3. [Synonyms rewrite phrases, scored per typed word](0003-synonyms-rewrite-phrases.md): why the
   Tees outranked the T-Shirts, and the three things that fixed it.
4. [Facets count past their own filter](0004-facets-count-past-their-own-filter.md): selecting
   "Red" never zeroes "Blue", and what that costs.
5. [The shape of the API](0005-the-shape-of-the-api.md): one search field, explanations on every
   hit, and a viewer the client cannot choose.
6. [The API runs in the browser, and in Node when asked](0006-the-api-runs-in-the-browser.md): a
   service worker answers the demo, a thin Node server answers everything else.
7. [A GraphQL client of our own, rather than Apollo or urql](0007-a-client-of-our-own.md): the
   stale response and the cache key are the point, so they are code here, not configuration.
8. [One cache key, defined once, for three layers](0008-one-cache-key.md): the store version,
   the viewer and the request, in the page, the browser and the handler, and the test that shows
   a member's price reaching a guest without the viewer.
9. [Events land beside the API, and stay in the browser](0009-events-stay-in-the-browser.md): a
   plain post rather than a mutation, IndexedDB in the worker rather than memory, and no seeded
   history, so the cold start stays something the demo can show.
10. [A rule is previewed by the engine, and saved as a new store version](0010-rules-live-in-the-browser.md):
    the preview is the real ranking, the edited set stays in the visitor's browser, and a save
    moves every cache key at once.
11. [Recent searches are page state, kept in local storage](0011-recent-searches-are-page-state.md):
    never the worker's events, filtered as a source rather than shown as a mode, cleared by a
    button beside a visible heading, and joined only by a search that found something.
12. [The widget keeps its own tree, and its popover takes the top layer](0012-the-widget-keeps-its-own-tree.md):
    a shadow root over scoped CSS, the top layer over a stacking context, a React of its own
    with the cost measured, and an embed on another origin answered by the Node server.
13. [A visitor's catalog stays in the browser, in a store of its own](0013-a-visitors-catalog-stays-in-the-browser.md):
    the same worker registered again under `try/`, a file mapped onto the products the store
    already has, read in the page and checked by the worker, capped at what a phone can search.
14. [The engine is proven on the Node it declares, as a user installs it](0014-the-engine-is-proven-on-the-node-it-declares.md):
    the packed tarball installed into an empty project and used on the lowest Node its engines
    range admits, with its types compiled as Node and a bundler resolve them.
15. [One store host for every transport](0015-one-store-host-for-every-transport.md):
    the worker, the Node server and the dev server serve one store host from the API, which
    folds clicks in when a visit begins and keeps the index when a set of rules is saved.
16. [The first screen is in the page, drawn by the components the script uses](0016-the-first-screen-is-in-the-page.md):
    the strip, the masthead and the waiting line rendered at build time from the same components,
    so they show before the script runs and nothing moves when it draws over them.
17. [A sort sets aside what rules do to the order, and the page says so](0017-a-sort-sets-aside-what-rules-do-to-the-order.md):
    hides hold under any sort, pins, boosts and buries give way to it and are named on the page,
    and a category's own sort keeps the pins written for it.
18. [Visits are counted by path, with Plausible, and not under Global Privacy Control](0018-visits-are-counted-by-path.md):
    the tracker bundled from npm, one site for the whole domain, each address cut back to its path,
    and never started under the signal or by the widget's own file.
19. [The pages are drawn from the design kit, and the store keeps what is its own](0019-the-pages-are-drawn-from-the-design-kit.md):
    the kit from npm at a pinned version, one layer at a time, its tokens, base, chrome and
    controls in place of the store's, and the palette, the widget's frame and the store's own
    components kept, with each gap in the kit filed against it until the kit took it.
