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
same, with a plainer dashboard and simpler events. Cloudflare Web Analytics, free, which counts no
clicks on links out.

**How it is loaded.** The script tag Plausible offers, from its origin, with an inline call to
start it. Its tracker from npm, bundled with the page like any other module. Or a sender of our
own that posts Plausible's events.

**How many sites.** One per project. Or one for the domain, since the portfolio and every demo live
under jasonsdevspace.com.

## Decision

**Plausible, from npm, as one site for the domain.** Plausible over GoatCounter for how long a page
is read and how far it is scrolled, for events that show a visit going on into a demo or out to the
repository, and for a tracker published on npm. The tracker is bundled into a module the demo's own
pages start from, so no script comes from another origin and no inline script is added. The
policy's `connect-src` allows `https://plausible.io` and nothing else changes. One site for the
domain shows a visit from the portfolio into a demo as one journey, and a project added under the
domain is counted from its first page.

**The path, never the query.** The store keeps a search in the address, so every address sent, the
page's, the one it came from and a link out's, is cut back to its path. The page's keeps the tags a
shared link carries, such as `utm_source`, which say where the link was shared and nothing about the
visitor, so a campaign still reads as one. Each page also tells the
browser to hand the next page the site's origin and nothing more, since the portfolio shares the
store's origin and would otherwise be handed the search for its own counter to send. A search
phrase never leaves the browser.

**Not under Global Privacy Control.** The tracker is never started when the browser sends the
signal, which is the check the store's events make.

**Never in the widget.** A page that embeds the widget is someone else's site to count, so the
widget's own file never starts the tracker. The demo's pages that host it are the demo's, and do.

## Consequences

- The demo's pages share one small script, the visit counter, which the browser fetches once and
  keeps for every page. The explainer shared no script with the store before.
- The tracker adds about 2 KB to the store's page, which the bundle test measured at 99 KB of its
  100 KB budget without it, so the budget is 104 KB. A sender of our own would have been smaller,
  but would have left out how long a page is read and how far it is scrolled, and been one more
  thing to keep in step with Plausible's events, in every repository that counts visits.
- The results and a product's page are the store's page with another query, and the query is
  never sent, so a visit counts the page it opened once. How far a shopper went within the store
  is the store's own events' business, as record 9 says.
- A counter that cannot start, in a browser without what it needs, leaves the page as it was, and
  an address it cannot read is not sent.
- Plausible leaves out pages on localhost and under an automated browser, so the dev server, the
  end to end tests and the Lighthouse audits count nothing.
- An ad blocker hides some visits, and GitHub Pages serves no proxy to route them through. The
  counts are a floor, not a census.
- The tracker is pinned to an exact version, like every other package.

## How it is tested

- A unit test starts the tracker under the domain with links out counted, starts nothing when the
  browser sends Global Privacy Control, and leaves the page alone when the tracker throws.
- A unit test holds every address sent to its path: the page's, the one before it and a link out's,
  keeps a shared link's tags on the page's, and sends nothing for an address that cannot be read.
- The end to end policy test reads `connect-src` as the page's own origin and Plausible, and follows
  a link from a search to find the next page handed the origin alone.
- The bundle test finds the tracker in every page the app serves, a page not yet in git included,
  read from each page's own entry, and nowhere in the widget.
- The bundle budget holds the store's page under 104 KB, and the page for a visitor's catalog under
  its own, each with the tracker in it.
