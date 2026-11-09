# Accessibility

The ShelfLens demo at [jasonsdevspace.com/shelflens](https://jasonsdevspace.com/shelflens/) is built
to meet the Web Content Accessibility Guidelines, WCAG 2.2, at level AA, in the light theme and the
dark one alike. That takes in the store, the page on how it works, the page that searches a
visitor's own products, and the search box on another site's page.

## How it is checked

Each of these runs in CI on every pull request, and a finding fails the run.

- **Automated audits.** axe audits every page in both themes, on a desktop and a phone, with the
  page for a visitor's own products both empty and with a file loaded. It audits every page again
  at 320 pixels wide with text at twice its size, and along the way of the browser tests that walk
  the store, the tour, the rules editor and the drawers.
- **Contrast.** Every pairing of the store's palette is measured in both themes: text at 4.5 to 1
  on every ground and tint it sits on, and the edge of a control and the stars of a rating at 3
  to 1. In the browser, every control on every page that is not off stands out from what is behind
  it by 3 to 1, through its edge or its fill, in both themes, on a desktop and a phone.
- **Keyboard and focus.** Tab reaches every control on every page and comes back around, and each
  control draws the one focus ring, in the accent. The suggestions are a combobox driven by the
  arrow keys and Escape. Opening a product moves focus to its name, going back lands on the card it
  came from, and Escape closes the filters drawer on a phone.
- **Announcements.** The results' status region says each new answer once the shopper pauses, so
  stepping through a filter's options with the arrow keys does not bury the one they stop on.
- **Targets.** On a phone, every select is at least 44 pixels tall, with text at 16 pixels so a tap
  does not zoom. At 320 pixels wide with text at twice its size, every control of the top bar and
  the tour can be tapped with nothing over it, and the page is never zoomed out.
- **Reflow.** No page scrolls sideways and no text is cut off at 320, 360, 375, 390, 412, 768 or
  1280 pixels wide, with text at the browser's size, at one and a quarter, one and a half and twice
  it. The store, the page on how it works and the page for a visitor's own products are held to
  that before their script runs as well. What may scroll sideways is a block of code, and the table
  of sizes and colors on a product, in a frame of its own the keyboard can reach.
- **Text spacing.** The filters column fits every filter with the letter, word and line spacing WCAG
  asks a page to allow.
- **Screenshots.** The results toolbar, a product's heading and its table, a card in explain mode
  and a card with focus, the suggestions, the search box on another site's page and the filters
  drawer are compared with screenshots in both themes, so a changed ring, edge or color is seen.
- **Lighthouse.** Every page scores a hundred for accessibility.

## Where it works

The store's build takes its target from the design kit's `browserFloor()`, which is Chrome and Edge
123, Firefox 120 and Safari 17.5. A test holds that floor to the one
[decision record 19](docs/decisions/0019-the-pages-are-drawn-from-the-design-kit.md) states, so a
version of the kit that raises it fails until the record says so. Each color reaches the browser as
written with `light-dark()`, and a part of a page set to the other scheme draws that scheme's
colors. The search box on another site's page draws its light colors in a browser without
`light-dark()`.

## Known limitations

- The browser tests run only in Chromium, on a desktop and a phone profile, so the other browsers at
  the floor are held to it by what they document rather than by a test here.
- No test runs a screen reader. What one would announce is checked through the names, roles and
  states the browser gives it, and through what the status regions hold.
- No test here runs the pages in forced colors.
- The wider text spacing WCAG asks a page to allow is measured on the filters column alone.
- Where the search box on another site's page sits low, its list of suggestions can scroll, and
  axe's rule that a scrolling region take a tab stop is left out of the audit there. Focus stays in
  the box, as a combobox keeps it, and a test holds the option the arrow keys reach in view.
- The criteria a tool cannot judge, such as whether a heading describes its section or a link's
  words say where it leads, are held by no test here.

## Reporting a barrier

If something in the demo is hard or impossible to use, open an issue with the
[bug template](https://github.com/jasonsdevspace/shelflens/issues/new?template=3-bug.md). Say what
you were trying to do and on which page, and under "Where" the browser and any assistive technology
you use. The acceptance criteria and the size are for whoever fixes it, and can be left empty. It is
labeled accessibility and handled as a bug. A barrier that is also a security issue goes to the
[security policy](SECURITY.md) instead.
