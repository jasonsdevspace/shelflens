# Changelog

The storefront is the demo at [jasonsdevspace.com/shelflens](https://jasonsdevspace.com/shelflens/), deployed from main on every merge. Release 1 is 1.0.0, Release 1.1 is 1.1.0, Release 2 is 1.2.0 and 2.0.0, and Release 2.1 is 2.1.0. From 1.2.0 on, each version is released from a tag on main, with its entry here as the release notes.

## 2.1.0

Release 2.1: the same store, faster, with one design throughout and the docs to match.

- **Faster on a large catalog.** The store runs engine 0.4.0, which answers the widest searches of a hundred thousand products in about a third of the time, with the same results.
- **One look for every control.** Every dropdown has the same caret, every control the same focus ring, and every button an edge you can see in both themes. The one action a view asks for is a filled button, and an action that reads as text is always underlined. On a phone each dropdown and button is a thumb's size, and a dropdown's text no longer makes the page zoom.
- **Counts read as numbers.** A count of a thousand or more is grouped, as in "1,999 products".
- **Your own products on a phone.** A long column name in your file no longer widens the page past the screen.
- **Suggestions recover.** If suggestions fail to load, coming back to the same words asks again.
- **Clearer when something fails.** A failure inside the store says so in the page's own words, rather than as a network error.
- **The same search box everywhere.** The search box is the same height on another site's page as in the store.
- **For developers.** The Node server runs only the storefront's own operations unless `FULL_QUERIES=true`, and the schema's `Store.catalogVersion` is now `Store.version`.

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
