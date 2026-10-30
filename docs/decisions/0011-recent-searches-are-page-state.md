# 11. Recent searches are page state, kept in local storage

**Status:** accepted

## Context

A shopper who searched this store before wants to run that search again without retyping it,
and a shopper on a shared device wants that list gone. Release 2 adds the list to the search
box. The worker already keeps every search this browser made, as events in IndexedDB, and the
box already has a popover with suggested queries in it, so two questions had real alternatives:
where the list lives, and how it sits beside the suggestions.

## Options

**Where the list lives.** In the worker's events, read back through the API, which would make
it one more thing the store answers. Or in the page's own local storage, read by the box, which
never crosses into the API at all.

**How it sits beside the suggestions.** As a mode: the list while the box is empty, the
suggestions once two characters are typed. Or as a source: the phrases that match what is
typed, at every length, above the suggestions when there are any.

**What clears it.** A row in the list that says "Clear", reached like any option. Or a button
of its own beside a visible heading.

**When a phrase joins.** When the search is made, or when its answer lands.

## Decision

**Local storage, in the page.** The events honor Global Privacy Control and stop entirely under
it, which is right for telemetry and wrong for a convenience that never leaves the browser.
A list the box reads from local storage is page state, like the tour's "seen" mark: nothing is
sent, nothing is asked of the API, and a private window or a refused store means nothing is
kept and nothing is offered. The storefront reads storage each time the box opens, so a clear
in another tab shows on the next open.

**A source, not a mode.** What was typed filters the list by prefix, on the whole phrase or on
any word, from the first character. With nothing typed the list is the whole history, newest
first, up to eight. From the moment the store is asked, at two characters, the matching recent
phrases are capped at three, so the list holds still while the answer is on its way, and once
the store has something to suggest they sit above it as a group of their own. A suggested query
that equals a recent phrase is dropped so nothing appears twice. The display always answers the
input, and the list never vanishes wholesale at the second character.

**A heading and a button.** The list is named by a visible heading, "Recent searches", so a
sighted shopper knows these are their own phrases and not the store's, and the screen reader
hears the same words. "Clear" is a real button beside it, reached by Tab, never by the arrow
keys, so nothing one keystroke from a phrase can wipe the list. It says "Recent searches
cleared" through the status line and puts focus back in the box.

**On the answer, not the search.** A phrase joins the list when its result lands with something
found. A typo that found nothing is never offered again, and the nothing-found page stays a page
with a way forward rather than a place to return to.

## Consequences

- The list is per browser and per site, and it is lost with the browser's storage. That is the
  point.
- The page's bundle budget test holds with the list in it.
- A phrase reached by a shared link counts as a search this browser ran, once it found
  something, which is the honest reading.
- The listbox grows groups once recent phrases sit beside suggestions. The combobox contract is
  unchanged: focus stays in the input, the only new focusable thing is the button outside the
  list.

## How it is tested

- The store: newest first, each phrase once however it was capitalized, a cap, nothing blank,
  a clear that leaves nothing behind, storage that holds something else or refuses, a change in
  another tab seen on the next read, and the prefix match on a phrase or any word in it.
- The box: the list on focus under its heading with an audit, nothing when there is nothing,
  filtering from the first character, groups above suggestions with no phrase twice, the clear
  button by Tab and Enter with the announcement and the focus return, Escape from the button,
  and the arrow keys never reaching anything that clears.
- The page: a search that found something is offered on the next focus and forgotten on
  request, and a search that found nothing never is.
- In a real browser: a search outlives a reload in the box, clears, and audits clean with the
  list open, on a desktop and on a phone.
