# Decision records

The decisions in this project that had a real alternative, with the option rejected, what the
choice costs, and the test or measurement behind it. Each was written when the decision was made,
so the evidence was still fresh.

1. [An engine of our own, rather than a library](0001-an-engine-of-our-own.md): the parts a
   library hides are the parts the project exists to show.
2. [Flat arrays for the index](0002-flat-arrays-for-the-index.md): from 979 MB and a third of a
   second to 84 MB and a tenth, measured by the same benchmark.
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
    with the cost measured, and a demo that is honest about what a real embed still lacks.
13. [A visitor's catalog stays in the browser, in a store of its own](0013-a-visitors-catalog-stays-in-the-browser.md):
    the same worker registered again under `try/`, a file mapped onto the products the store
    already has, read in the page and checked by the worker, capped at what a phone can search.
14. [The engine is proven on the Node it declares, as a user installs it](0014-the-engine-is-proven-on-the-node-it-declares.md):
    the packed tarball installed into an empty project and used on the lowest Node its engines
    range admits, with its types compiled as Node and a bundler resolve them.
