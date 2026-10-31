# 12. The widget keeps its own tree, and its popover takes the top layer

**Status:** accepted

## Context

Release 2 ends with the search box as a widget: one script a host page loads and mounts into an
element of its own, so the popover works on a page that is not the store's. The brief asks for
isolated styles, a stacking context of its own, and survival of the host's CSS, with a record on
Shadow DOM against scoped CSS and on avoiding a clash with the host page's own React. The host
pages worth designing for are the hostile ones: a reset on every element, a rule on every list
item, a banner stacked over everything, a box that clips what it holds, and a React of a
different version already on the page.

## Options

**Where the widget's markup lives.** In the host's own tree, with every class prefixed and every
rule written to beat the host's. In an open shadow root on the element the host hands over. Or
in an iframe on the store's origin.

**Where the popover paints.** Inside the widget, with a stacking context of its own so the
host cannot interleave with it. Or in the browser's top layer, over everything.

**Whose React.** The host's, found as a global or handed in. Or a React bundled into the widget's
own file. A lighter runtime with React's shape was measured as well.

**Where a host's search goes.** Nowhere, with the host told through a callback. Or to the store
the host names, with the callback as the override.

## Decision

**A shadow root.** Selectors from the host stop at the root, so a rule on every list item or every
input never reaches the box, and two widgets on one page never share an id. Scoped CSS loses to
a reset on every element and to a rule on `ul li`, which beats a class on specificity, and the
demo's host page carries both to show it. An iframe isolates more than this and demonstrates
less: the popover cannot extend past the frame's box, a pick has to reach the top window by a
message, and every question the brief asks a record about stops being a question. What a
shadow root does not stop is inheritance, so the widget's container pins the font, the color,
the line height and the letter spacing, and takes its colors from the one standard property a host sets to theme it, `color-scheme`, through `light-dark()`, with the light values alone for a browser that does not know it. The store's own theme script sets
that property, so on the demo's host page the widget switches with the portfolio and the store.
Layout and the stacking context sit on that inner container rather than on `:host`, where a host
rule on the element would win, and the element is given `display: block` as an inline style at mount, which only an `!important` could beat.

**The top layer.** A stacking context of its own makes the popover's order private but leaves the
widget in the host's order at `auto`, so a fixed banner at a high z-index paints over the list
and an ancestor that clips cuts it off. Those are the two ways a widget's list usually loses, and
a demo with that banner would show the widget losing. Where the browser has a top layer the
popover is a `popover="manual"` element that the box shows while the list is open and hides when
it closes, placed from the box's own rectangle, under the box or above it when there is more room
there, within the viewport's edges, and followed on scroll, on resize and on any layout the page
shifts under it. The top layer beats every z-index and every clip, and it is the same element in
the same tree, so every id the box refers to still resolves, focus moving onto the clear button is
still focus within the popover, and a screen reader hears the same list. The store's own page
uses the same placement. A browser without a top layer gets the list as it always was, under the
box and as wide as it, which no host can promise to keep in view.

**A React of its own.** The widget's file carries React and nothing in it reads or sets a global
the host's React depends on, so any version on the host is left alone, and a host built on React
mounts the widget from an effect and calls the returned function from the cleanup. That costs the widget's size: React is nine tenths of the file, which ships minified at 76 KB compressed, the figure the bundle test records, as an ordinary build with one entry rather than library mode, which leaves whitespace in an ES file. A lighter runtime with React's shape would take most of that out, and does carry the hooks the box uses. It was not taken because the repo then has two frameworks and two
sets of behavior to test, and one search box has to look the same in both. The record says what
that choice costs so it can be revisited.

**To the store, unless the host says otherwise.** A host hands the widget the API's address and
the store's, and a search or a product opens the store's page. A host with a page of its own for
either passes a callback instead.

## Consequences

- The demo's host page is served under the worker's scope and registers the worker the way the
  store's page does, so the widget's requests are answered in the browser. The widget itself
  knows nothing about workers, which keeps record 6's line: nothing in the widget knows which
  host answers. A page on another origin is not controlled by this worker, so a real embed on
  another site runs the Node server with that origin named. The server answers the preflight for
  the origins the host names and refuses every other, and keeps the events and rules paths to the
  origins named for them, since a refused answer a browser cannot read is still a request the
  server acted on. The browser test mounts the widget from a second origin against it.
- The widget reads this browser's recent searches and never writes them, since a phrase joins on
  a landed result and the widget's default search opens the store before one lands. On the demo
  the store's page records it. On another origin the list stays empty.
- The widget has a budget of its own in the bundle test, set above its measured size so growth is
  caught rather than hidden under the page's.
- The host page carries a React of its own and the widget another, which the demo shows counting
  on after the widget mounts.

## How it is tested

- The bundle: the widget's file stays under its budget with nothing from GraphQL in it.
- The box in a shadow root: the highlighted option is found and scrolled through the box's own
  tree, and Enter searches it.
- The widget: it mounts into a shadow root with its own sheet and nothing in the host's document,
  answers with a working box over the real API, opens the store on a search when the host says
  nothing else, and comes out again.
- In a real browser, on a desktop and on a phone: the host's own React keeps counting, the
  host's rules reach its own elements and not the widget's, the list opens over the host's banner
  and out of the box that clips it, which the element at its center proves, the page audits
  clean with the list open, and a search lands on the store's page.
- From another origin: a page served from an origin of its own loads the widget's file from the
  demo, the Node server answers its preflight and its requests, and a search lands on the store.
  The server's own tests cover the preflight, an origin the host did not name, and the events and
  rules paths kept closed.
