# Changelog

The storefront is the demo at [jasonsdevspace.com/shelflens](https://jasonsdevspace.com/shelflens/), deployed from main on every merge. Release 1 is 1.0.0 and Release 1.1 is 1.1.0. From 1.2.0 on, each version is released from a tag on main, with its entry here as the release notes.

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
