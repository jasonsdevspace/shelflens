# Changelog

The storefront is the demo at [jasonsdevspace.com/shelflens](https://jasonsdevspace.com/shelflens/), deployed from main on every merge. Release 1 is 1.0.0, Release 1.1 is 1.1.0, Release 2 is 1.2.0 and 2.0.0, and Release 2.1 is 2.1.0. From 1.2.0 on, each version is released from a tag on main, with its entry here as the release notes. The version follows the releases of the demo rather than its API, so a change that breaks something for developers is marked as breaking in its entry.

## 2.1.0

Release 2.1: the same store, faster and steadier, with one design throughout, a tour that shows what it says, and the docs to match.

- **Faster on a large catalog.** The store runs engine 0.5.0. Since 0.4.0 the engine answers the widest searches of a hundred thousand products in about a third of the time, with the same results.
- **A first screen at once.** The portfolio strip and the store's name show before the script runs, and the page no longer jumps as the store arrives. "Preparing the store." shows only when the start takes a moment, and says when a first visit takes longer. A browser with JavaScript turned off is told the store needs it.
- **Every wait ends.** A store that cannot start says why within half a minute, and offers to try again when trying again can help. A private window that refuses the store is told to open a regular one.
- **Clearer when something fails.** Results or a product that do not load say so in plain words, with a Try again button, and a failure inside the store says so in the page's own words rather than as a network error.
- **Suggestions recover.** If suggestions fail to load, coming back to the same words asks again.
- **A new top of the page.** The demo's own controls, "Shopping as" and "Tour", sit in the strip with the portfolio links. The masthead below is the store's own: its name, the search box and the categories.
- **Filters you can read at a glance.** Each group of filters has its own heading, set off by a line. The category group shows where you are and the way back up. Each filter that is on shows as a chip under the results heading, and pressing a chip removes that filter.
- **Ratings as stars.** A card shows its rating as stars with its average and its count, as in "3.7 (664)". A screen reader hears it once, in words. The rating filter shows the same stars beside each choice, as in "4 stars and up".
- **A results page that holds its shape.** The toolbar, the filter and rules drawers on a phone, and explain mode's cards keep their places on a phone and a laptop. Counts agree in number, as in "1 result", and a count of a thousand or more is grouped, as in "1,999 products".
- **Every sort works.** "Catalog order" sorts by each product's place in the catalog. A hidden product stays hidden under every sort, and the line under a sort names each rule it set aside and what it lost, as in "the boost of "Ridgeback boots first"", with a button back to relevance. The rule form says a boost or a bury applies only under "Relevance".
- **A product page that keeps your place.** Loading, switching "Shopping as" and going back keep the product and focus where they were. The sizes and colors table has a row for each color and price, a member sees what a guest pays beside the member price, and the rail says where its products come from.
- **One look for every control.** Every dropdown has the same caret, every control the same focus ring, and every button an edge you can see in both themes. The one action a view asks for is a filled button, and an action that reads as text is always underlined. On a phone each dropdown and button is a thumb's size, and a dropdown's text no longer makes the page zoom.
- **Larger text and zoom.** From a phone's width up, no page scrolls sideways with text up to twice its usual size, or at 400% zoom. The one exception is the table of sizes and colors, which scrolls in a frame of its own that you can also scroll from the keyboard.
- **The same search box everywhere.** The search box is the same height on another site's page as in the store.
- **Your own products, at every step.** While you choose and check a file, "Choose another file" is always there, and "Back to your products" is there when you came from searching them. Each column you can choose shows two of its values, so you can see what it holds. When something fails, the message says what to do next, and a screen reader hears each problem and each change. If another tab removes or replaces your products, this tab says so, and a long column name no longer widens the page past the screen.
- **A tour that shows what it says.** Each stop describes what its page shows, in the page's own words, and links the tests that prove it. "Try it" puts focus on what the stop points at, in view above the tour. A reload keeps your place, and on a phone a first visit offers the tour in a short bar with "Start" and "Not now". Its buttons stay in one place from stop to stop.
- **Safer pages.** Every page carries a security policy that lets it load only from its own site and run only its own scripts.
- **For developers, breaking.** The Node server runs only the storefront's own operations unless `FULL_QUERIES=true`, and the schema's `Store.catalogVersion` is now `Store.version`.

## 2.0.0

Release 2, complete: your own products in the same store, after the recommendations, rules editor and embeddable search box of 1.2.0.

- **Search your own products.** Choose or drop a CSV or JSON file of up to ten thousand products on [the page for your own products](https://jasonsdevspace.com/shelflens/try/), or press "Try it with a sample of 200 products". The file is read in your browser and never uploaded.
- **Guesses you can correct.** The page guesses which column is the name, the price and each filter. It shows the first products as the store will show them, so you can catch a wrong guess and correct it before you search.
- **The same store, over your products.** Your products get suggestions, filter counts, "Explain ranking" and rules of your own. If you saved rules, the page asks before a new file replaces them, and before "Remove your products" discards them.
- **Your products on a store's page.** Open "See your products on a store's page" to search them from the search box on a made-up store's page, the way a real store would add it.
- **Clearer to use.** Buttons, dropdowns and options show the pointing hand, and a control that is turned off keeps the plain arrow.
- **The story on "How it works".** The page has a new section, "Try it on your own products".

## 1.2.0

Recommendations, ranking that learns from what you open, a rules editor, and a search box other sites can embed.

- **Recommendations.** Each product page has a rail of other products. It shows the category's most rated until you have viewed a second product, then what you viewed, and its heading says which. A product never recommends itself.
- **Popularity in ranking.** Products you open rise a little when your next visit begins, with the reason shown under "Explain ranking". They never pass a product a merchandiser pinned and never leave one that was buried.
- **Events kept in the browser.** Searches, clicks and views are recorded without slowing the page. They never carry personal data, stay in this browser, and stop when the browser asks not to be tracked.
- **A rules editor for merchandisers.** Press "Rules" on a search to pin, boost or bury a product for that query. The results preview the rule before you save it.
- **Recently searched.** Your earlier searches are offered first and filtered as you type. They stay in this browser, and "Clear" removes them.
- **An embeddable search box.** The search box drops into another site's page and keeps its own look, because that page's styles cannot reach it. It can search from another site through the Node server, which answers only the sites its host lists.

## 1.1.0

Release 1.1, a polish pass from a design review and an interaction review of the live demo.

- Explain mode reads clearly, and the dark theme meets contrast guidelines.
- Every change is announced to screen readers and keeps your place.
- The page says what you changed, and the filter column fits on a screen.

## 1.0.0

Release 1, the first version linked from the portfolio.

- A search box with suggestions, a results page with filters, counts, sorting and pages, and a product page.
- Customer groups that each see their own prices and products, with caching that keeps them apart.
- Explain mode, a page for searches that find nothing, and a guided tour.
- The whole API running in the browser, in a small program the page installs, over a generated catalog.
