# 17. A sort sets aside what rules do to the order, and the page says so

**Status:** accepted

## Context

A merchandising rule can pin products to the top, boost or bury them, or hide them
([record 10](0010-rules-live-in-the-browser.md)). Boosts and buries work by changing a product's
relevance score, and a pin places a product ahead of the order relevance gives. A shopper who
chooses to sort by price or by rating has asked for a different order. Applying the rules anyway
would put a pinned jacket above a cheaper one under "Price, low to high", and a boost would mean
nothing at all, since the score it changes is not the one the sort reads. A merchandiser looking at
a sorted page would see a rule they saved doing nothing, with no way to tell why.

A category is the exception. A category page has an order of its own, the position the
merchandiser gave each product, and a rule written for that category is part of how the page is
meant to look.

## Options

**Apply every rule under every sort.** Pins stay on top of a price sort, which breaks the order
the shopper asked for. Boosts and buries still do nothing, silently.

**Drop the rules under any sort but relevance, and say nothing.** The order is the one asked for.
The merchandiser sees a rule switched off and no reason.

**Drop what a rule does to the order, keep what it does to what is shown, and report it.** A hide
is about whether a product may be shown at all, not where, so it holds under every sort. Pins,
boosts and buries give way to the sort, and the rules they came from are named in the answer, so
the page can say which rules the sort set aside and how to bring them back.

Who reads the line is a choice of its own. **Show it only with "Rules" or "Explain ranking" on**,
and a shopper never reads about rules, but a visitor who sorts while just browsing sees the order
change with no word of the merchandising that gave way. **Show it to every visitor**, and the store
is open about what a sort changed, with a way back a shopper can use, at the cost of merchandising
words a shopper has no use for.

## Decision

The third, with the category's own sort kept, and the line shown to every visitor.

`planRules` in `packages/engine/src/rules.ts` reads the request's sort. Under relevance every rule
that matches applies in full. Under any other sort, a rule keeps its hides and is listed in
`applied` when it has any, and a rule whose pins, boosts or buries the sort sets aside is listed in
`setAside`, with its name and how many of each gave way. Its pins are counted only where it would
have placed them under relevance: a product an earlier rule pinned, or one a rule hides, is not
counted, and a rule that would have placed nothing is not listed. A rule that both pins and hides
is in both lists. `setAsideBySort` lists the same rules by id, and is kept for the clients that
read it.

A sort scoped to a filter, as the store's "Featured" sort is scoped to the category, keeps a rule
whose filter is on that attribute. Such a rule keeps its pins and its hides and is listed in
`applied` when it has any. Its boosts and buries do nothing, since the position sort does not read
a score, so a rule that has them is listed in `setAside` as well, with no pins counted, and a rule
that only boosts or buries is listed there alone. Browsing one category with no query chooses its
scoped sort without being asked (`defaultSort` in `packages/engine/src/sort.ts`), so a category
page shows the merchandiser's order with that category's pins on top.

The API passes all three through as `Merchandising.applied`, `Merchandising.setAsideBySort` and
`Merchandising.setAside` (`packages/api/schema.graphql`). The results page in
`apps/storefront/src/results/ResultsPage.tsx` shows a line over the cards whenever a rule was
set aside, naming the sort and each rule by its name, or its id when it has none, with what the
sort took from it, as in "The sort "Featured" sets aside the boost of "Ridgeback boots first"",
with a "Sort by relevance" button after it that puts focus on Sort by. It shows whether or not
"Rules" or "Explain ranking" is on. The line is written by `setAsideBySort` in
`apps/storefront/src/results/setAside.ts`, into a status that is always in the page, so a
screen reader hears it when a sort brings it. The rules panel lists the rules applied and the rules
set aside together, each once, and marks each one the sort set aside.

## Consequences

- Under any sort that is not scoped, the shopper's sort is the order they see, apart from what a
  rule hides.
- A merchandiser can tell a rule that does nothing under this sort from one that never matched.
- Under a category's scoped sort, a boost or a bury for that category does nothing, and the page
  says so. The rule form says before the rule is saved, under "How much", that a boost or a bury
  applies only under "Relevance" and that every other sort, "Featured" included, sets it aside. It
  is a hint rather than a refusal, since the same rule applies in full under "Relevance", the sort
  a search starts on. The demo's `ridgeback-boots` rule, which boosts a brand when "boots" is
  searched inside the boots category, meets this under "Featured". A merchandiser who wants a
  product higher in a category's own order pins it, or changes its position.

## How it is tested

- `packages/engine/src/rules.test.ts`, under "rules and the sort": a rule's pins are counted only
  where it would have placed them, and a rule that would place none is not listed, a query rule is
  set aside under any sort but relevance and says so, by name and with each of its pin, boost and
  bury counted, while its hide holds, a category rule is kept under that category's position sort,
  a category rule there keeps its pin and its hide while its boost and its bury leave the order
  alone and are counted as set aside with no pin, and a category rule is set aside under an
  unrelated sort.
- `packages/api/src/api.test.ts`: a search under relevance reports its pin in `applied` and nothing
  set aside, and under a price sort each rule set aside comes back with its name, or null, and its
  counts.
- `apps/storefront/src/App.merchandising.test.tsx`: the page says when a sort set the
  merchandising aside, in a status that stays in the page, and its button sorts by relevance and
  puts focus on Sort by. The same line shows to a shopper with "Rules" and "Explain ranking" off
  and to a merchandiser with both on. `apps/storefront/src/results/RulesPanel.test.tsx`: the
  panel marks each rule the sort set aside, and no other.
  `apps/storefront/src/results/setAside.test.ts` holds the line's wording: each rule by its
  name or its id, each kind it lost in the singular or the plural, and every rule as a list is
  read.
- `apps/storefront/e2e/merchandising.spec.ts`: sorting the jackets by price says the pins of
  "Featured jackets" are set aside and leaves the hidden sample out of the line, since its hide
  still holds, and the button goes back to relevance with focus on Sort by.
- `apps/storefront/e2e/merchandising.spec.ts`, under "Featured" in the boots category: the line
  says the boost of "Ridgeback boots first" is set aside, and nothing else.
- `apps/storefront/src/results/RulesPanel.test.tsx` and `setAside.test.ts`: the rule form says
  so for a boost and a bury, with or without a category filter, and not for a pin, and the store
  itself sets a boost and a bury aside under "Featured" and under "Rating", in a rule for the
  category and in a rule for the words alike. `apps/storefront/e2e/merchandising.spec.ts` opens
  the demo's `ridgeback-boots` rule and finds the hint under "How much".
