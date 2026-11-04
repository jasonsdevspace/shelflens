# 18. Visits are counted by path, with Plausible, and not under Global Privacy Control

**Status:** accepted

## Context

The demo is part of a portfolio, and whether anyone reads it is worth knowing: which pages are
opened, where a visitor came from, and whether a visit from the portfolio goes on into a demo or out
to the repository. The site is static on GitHub Pages, behind a Content Security Policy that lets
a page load script only from its own origin, and every page is held to a Lighthouse score and a
bundle budget. The store already promises that what a shopper searches stays in the browser, and
that its events stop under Global Privacy Control, as record 9 says.

## Options

**Which service.** Google Analytics, which sets cookies, so a visitor in the EU or the UK would
first be asked to agree, and which loads tens of kilobytes from Google's origins. Plausible, which
sets no cookie and keeps nothing in the browser, for a monthly fee. GoatCounter, free and much the
same, with a plainer dashboard. Cloudflare's, free, with no events of its own.

**How it is loaded.** The script tag Plausible offers, from its origin, with an inline call to
start it. Or its tracker from npm, bundled with the page like any other module.

**How many sites.** One per project. Or one for the domain, since the portfolio and every demo live
under jasonsdevspace.com.

## Decision

**Plausible, from npm, as one site for the domain.** The tracker is bundled into a module the
demo's own pages start from, so no script comes from another origin and no inline script is added.
The policy's `connect-src` allows `https://plausible.io` and nothing else changes. One site for
the domain shows a visit from the portfolio into a demo as one journey, and a project added under
the domain is counted from its first page.

**The path, never the query.** The store keeps a search in the address, so each visit and click is
sent with its address, and the address it came from, cut back to the path. A search phrase never
leaves the browser.

**Not under Global Privacy Control.** The tracker is never started when the browser sends the
signal, which is the check the store's events make.

**Never in the widget.** A page that embeds the widget is someone else's site to count, so only
the demo's own pages start the tracker.

## Consequences

- The demo's pages share one small module, the tracker, which the browser keeps for every page.
  The explainer shared no module with the store before.
- The tracker adds about 2 KB to the store's page, which measured 99 KB of its 100 KB budget
  without it, so the budget is 104 KB. A sender of our own would have fit in half a kilobyte, but
  would have left out how long a page is read and how far it is scrolled, and been one more thing
  to keep in step with Plausible's events, in every repository that counts visits.
- The results and a product's page are the store's page with another query, and the query is
  never sent, so a visit counts the page it opened once. How far a shopper went within the store
  is the store's own events' business, as record 9 says.
- Plausible leaves out pages on localhost and under an automated browser, so the dev server, the
  end to end tests and the Lighthouse audits count nothing.
- An ad blocker hides some visits, and GitHub Pages serves no proxy to route them through. The
  counts are a floor, not a census.
- The tracker is pinned, like every other package, and its version is chosen as they are.

## How it is tested

- A unit test starts the tracker under the domain with links out counted, and starts nothing when
  the browser sends Global Privacy Control.
- A unit test holds every address sent to its path, the page's and the one before it.
- The end to end policy test reads `connect-src` as the page's own origin and Plausible.
- The bundle test finds the tracker in the store's page and nowhere in the widget.
- The bundle budget holds the page for a visitor's catalog with the tracker in it.
