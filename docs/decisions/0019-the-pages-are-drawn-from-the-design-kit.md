# 19. The pages are drawn from the design kit, and the store keeps what is its own

**Status:** accepted

## Context

ShelfLens drew every page from styles of its own: a theme script, a set of tokens, base rules, the
strip and the footer, buttons, fields, callouts and an explainer layout. The portfolio and its
other demos need the same pieces, so they moved into `@jasonsdevspace/design-kit`, published on
npm, and the store was left holding copies that would drift from it. The store is held to a
Lighthouse score, an axe audit, a bundle budget and a screenshot of every view, and its widget
draws inside a shadow root on pages the store does not own.

## Options

**How the kit arrives.** Copy its files into the repository, and the copies drift from the kit as
the store's own would. Point at its source in a workspace or a git address, and a change to the kit
reaches the store with no change of the store's to hold it to its checks. Or install it from npm
at a pinned version, as a reader of the kit would.

**How much at once.** Take the whole kit in one change, and every screenshot moves at once, for
reasons that cannot be told apart. Or take one layer at a time, the theme script first, then the
tokens, the base, the chrome, the controls and the explainer, each held to every check before the
next.

**Where the kit falls short.** Wait for the kit before taking a piece, and keep the store's own copy
until then. Restyle the kit's pieces from the store's sheet wherever the store would draw them
differently, and drift from the kit through overrides of its own. Or take each piece as the kit
draws it, keep the smallest workaround of the store's own where the kit cannot do what the page
needs, and file what the kit is missing against the kit.

**What moves.** Everything that looks like the kit, and the kit grows pieces only one demo draws. Or
only what the kit's other users draw the same way, with the store keeping what is the store's.

## Decision

**From npm, pinned, one layer at a time.** The store installs the kit at an exact version, so it
takes the kit as any other project would and a new version is a change of its own. Each layer was
its own pull request, and each screenshot it moved was taken again for a reason it names.

**What moved to the kit.**

- The theme script that runs before the page paints, from the kit's Vite plugin, with the policy
  allowing it by the hash the kit gives for it.
- The tokens: every color role, space, size and line height, the corners, the raised shadow, the
  scrim and the focus ring, named by the kit's `--dk-` roles.
- The base: the border box, the body's type, the one focus ring, a heading's weight and the cut to
  motion, with the kit's line heights for text and headings.
- The strip and the footer, drawn by the kit's React components on the store's pages, and the skip
  link too on the pages written by hand, which write the kit's markup for each.
- Every bordered button, every field and select, and every line the page sets apart, as the kit's
  `Button`, `InputField`, `SelectField` and `Callout`, or as their classes where the page draws the
  element itself, with a failure in the callout's tone for something that went wrong.
- The explainer's layout: its header, numbered sections and the steps of a search.

**What stayed the store's.**

- **Its palette.** The store takes the kit's roles, and sets again the few it draws its own way:
  the highlight, the tour's raised panel, the kit's danger role and a wider measure for a page of
  reading. The rating, a swatch's edge and the weight of the store's mark keep names of their own.
- **The widget's frame.** The widget draws in a shadow root on someone else's page, where the kit's
  sheets do not reach, so its frame carries every role it reads in a sheet only the widget loads, as
  record 12 says.
- **The store's own components.** The facets, the cards, the search box, the tour, the rules panel
  and the mapping of a visitor's columns are what the store exists to show, and no other demo draws
  them.
- **A few pieces the kit does not have.** The large button that ends a step, the button that
  reads as text, the tour's quiet Close and the muted line the store calls a notice.
- **The prose on the widget's demo pages,** in a sheet beside those pages, since the explainer no
  longer shares it.

**Where the kit fell short,** the store took the piece anyway, kept a small workaround where the
page needed one, and filed each gap against the kit:

- `Button`'s props have no place for a ref, so a button the page moves focus to is a plain button
  that wears the kit's class.
- The strip draws no room for switches still on their way, so the store's sheet draws an empty box
  in its place while the store loads.
- The kit's skip link waits above what holds it, which is out of sight only at the top of a page,
  so the way past the filters, at the top of their column, is clipped to nothing until a keyboard
  gives it focus.
- An empty live callout still draws its ground, so the store holds each one out of sight until it
  has words.
- The kit's footer cannot mark its link to the explainer as the current page, so on the explainer
  that link goes unmarked while the strip's is marked.

**Amended with design kit 0.1.0-next.3.** The kit took each gap above, and all but one of the
store's workarounds went with them. A button the page moves focus to is the kit's `Button`, holding
its ref. The strip keeps the room of the demo's switches while the store loads, with no box of the
store's. The way past the filters wears the kit's skip link, which now waits clipped to nothing
where it sits. Its column is always positioned, so it shows at the column's top when a keyboard
gives it focus. The footer on the explainer marks its link there as the current page, as the
strip's does, and the kit draws that link, in the strip and the footer, at the heading's weight. A
live callout the store mounts empty now draws nothing, but the store still holds it out of sight
until it has words, since an empty one stays in the flow, and some sit in a grid whose gap would
open around it.

**Amended with design kit 0.1.0-next.5.** The kit's strip names its author in its first link, "Jason
Poteet", which leads to the portfolio as the footer's does, and the three pages that write the strip
by hand say so too. The store names its switches' width in the kit's `--dk-strip-tools`, so the room
the strip keeps for them is as wide as they are when they come, and nothing below the strip moves at
any width. The kit pads a callout as its other boxed text, holds the footer's sentence to the
measure, gives a summary its pointer, which the store's own rule no longer repeats, and marks an
invalid field in forced colors. A callout now takes a page's class, but the store keeps its holder,
which keeps the room below a callout and holds a live one out of sight until it has words.

**Amended with design kit 0.1.0-next.6.** The page build takes its target from the kit's
`browserFloor()` rather than writing the floor out by hand, so the target moves when the pin does. A
test holds what the kit gives to the floor this record states below, so a version of the kit that
raises its floor fails until this record says so, and a raised floor never arrives in a pull request
that shows only a version changing. The store keeps the default CSS transformer, which reads the
build target, so the kit's floor for Lightning CSS is not needed.

**Amended with design kit 0.1.0.** The store pins the kit's first stable version, which has the code
of 0.1.0-next.6, so nothing the store draws changes with it.

**Amended with design kit 0.3.0.** The footer reads as whole sentences and names the license for
the store's source alone, as the kit's has since 0.2.1, on the store and, written by hand, on the
explainer. The store's own sentence after it names ShelfLens, since the kit's now end on the
source. The theme script's hash changed with 0.3.0, and the page's policy reads it from the
package, so nothing here copies it. The store draws none of the kit's new theme switch, copy button
or pill.

## Consequences

- A fix to a button, a field or a callout is made once, in the kit, and reaches the store with the
  version that carries it.
- Body text runs at the kit's line height rather than the browser's, so every view is taller than
  it was, and every screenshot was taken again for that.
- The kit's field text is never under 16px, so the store's selects take that size on a wide screen
  too.
- The kit cuts every delay in a stylesheet for a visitor who asks for less motion, so the wait
  before the results dim is kept in the script, and the host page's waiting line shows at once for
  that visitor.
- A new version of the kit is a pull request of its own, held to the same checks, so a change in
  the kit never reaches the store unseen.
- Each workaround lasted until the kit took its gap. Since design kit 0.1.0-next.3 the store keeps
  only the holder that takes a waiting callout out of the flow.
- The bundle budgets did not move, and every page stayed under its own.
- The page build takes the kit's browser floor from `browserFloor()`, which is Chrome and Edge 123,
  Firefox 120 and Safari 17.5, for its script and its sheets alike. Each `light-dark()` reaches the browser as written and picks
  by the scheme of the element that draws it. Vite's default target rewrote each one into switches
  set once on the root, which drew the same page but left any part set to the other scheme in the
  page's colors. A browser under the floor no longer gets the store's script without its colors.
  The widget's build keeps Vite's default target, since the pages it runs on are not the store's
  to hold to a floor, and its colors still reach the browser as written, behind the feature check
  record 12 describes.

## How it is tested

- The theme test reads every page from the Vite config, holds each to asking for the kit's script,
  and holds each built page's policy to the hash of the script that lands in it.
- A browser test sets the body of every page in the dark theme to the light scheme and holds its
  text and its ground to the light theme's colors, so a build that rewrites `light-dark()` fails it.
- A token test reads every store sheet and finds no color written outside the palette. It holds
  the store's palette to every pairing the kit measures in both themes. It holds the widget's frame
  to every name the widget reads, its colors to the store's pages and every value it repeats from
  the kit to the kit's own, so the one copy the store keeps cannot drift.
- A class test holds every class a page written by hand wears to a rule in the kit's sheets or the
  store's, and every class a store sheet styles to something that wears it, so a class the kit
  dropped or the store deleted fails it.
- A chrome test holds the skip link, the strip and the footer written by hand to what the kit's
  components draw.
- A browser test holds every control on every page that is not off to an edge of 3 to 1 and the one
  focus ring, and each select to its caret, in both themes and on a phone.
- The end to end tests, the axe audits, the Lighthouse audits, the size budgets and the screenshot
  comparison ran on every layer, and each changed screenshot was accepted with the reason for it.
