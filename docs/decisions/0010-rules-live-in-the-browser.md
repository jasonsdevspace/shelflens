# 10. A rule is previewed by the engine, and saved as a new store version

**Status:** accepted

## Context

The merchandising rules are a file the demo ships, loaded beside the catalog when the store is
built. Release 2 lets a merchandiser write one in the page: pin, boost, bury or hide a product or
a brand for a search, see the result before committing to it, and save it. The brief asks for
three things at once. The preview has to be what the store will show, not an imitation of it.
A saved rule has to reach every answer, including the ones already kept in three caches. And the
public demo has no server: the API is a service worker in the visitor's browser, and every edit
has to stay with the visitor who made it.

## Options

**Where a preview is computed.** In the page, by reordering the results it already has to match
the draft. Or by the engine, through the API, with the draft in place of the store's rules.

**Where an edited set lives.** On a server, which the demo does not have. In the page's own
storage, sent with each request. Or in IndexedDB inside the worker, beside the events, where the
worker, the page and a browser test can all open it.

**How a save takes effect.** By patching the running store's rules in place, which is the least
work. Or by building the store again under a new version, which is what a catalog import does.

## Decision

**The engine previews.** The API has a `preview` field that takes a search and a set of rules
and answers with the same shape as `search`, from an engine reconfigured with the draft. The page
asks it as it would any search, so the preview is the real ranking with the real explanations
under each card, and a draft the engine refuses is refused before anything is saved. The answer
is marked volatile, so no layer keeps it: the draft is in the variables, but a preview is a
question nobody asks twice, and a kept one would only take the place of a real answer.

**The set lives in the browser.** The worker keeps the saved rules in IndexedDB, in a database of
their own, and answers a `rules` path beside `graphql` and `events`: a `GET` for the set in
effect and whether it is edited, a `POST` to replace it, a `DELETE` to go back to the shipped
file. The Node server answers the same path from a store the host supplies. Nothing leaves the
visitor's browser, and a second visitor sees the shipped rules, which is the demo's contract. The
worker for a visitor's own catalog keeps its rules in a database of its own, so a rule naming one
of their products can never reach the demo's store and fail its build.

**A save builds the store again.** The worker builds a new store with the saved set, swaps it in
once it is ready, and answers with the new version in the header the page already reads. The
rules are fingerprinted into the version, so every key in every layer moves at once, the worker
drops the other versions' kept answers, and the page empties its memory and makes a new client.
Nothing is invalidated by name, because the rule the caches already follow for a catalog import
covers this too.

**One rule at a time, in the merchandiser's words.** The form offers a name, the search words,
what the rule does, and which product or brand, with the weight as three named steps rather than
a number. The explain line under each card says the same weight, so what was chosen and what
happened agree. A product is picked from the results beside the panel, which is the only list a
merchandiser has in front of them, and the panel says what is wrong under the field once a save
is tried, not while the rule is half typed.

## Consequences

- A saved set is in effect on every page, so every page says so while it is, with the way back
  one press away. The tour never describes a store nobody can return to.
- A preview is an uncached request, so typing into the panel asks the engine on each change. In
  the browser that is the worker, and a search answers in a few milliseconds. The Node server rates the
  path as it rates its siblings, since a save builds the whole store again.
- The rules path is a plain `POST` outside the schema, like events, and for the same reason: the
  public demo accepts only persisted operations, and a mutation would have to go where it refuses.
- A saved set is a whole set, not a patch. The host checks the whole thing with the engine before
  it replaces anything, so the store is never built from a set that fails to load.
- A rule can name a product that is not on the current page only by typing its SKU, and the panel
  refuses it until it is. That is a limit chosen over a product search inside the panel, which
  would be a second search box on a page about search.

## How it is tested

- The API: a preview equals a search over a store built with the same rules, is volatile, and
  refuses a rule naming a product that does not exist with a user error that says the SKU.
- The rules path: a `GET` says the shipped set and that it is not edited, a `POST` with a set the
  engine refuses changes nothing and says why, a good `POST` is the new set, and a `DELETE` gives
  the shipped set back.
- The worker: a save is a new store version, the search after it equals the preview before it,
  and every answer kept under the old version is gone.
- The panel: the rules that apply to the search are listed, a draft goes up the moment the rule
  is sound and not before, the weight steps mean the weight the engine sees, a failed save says
  what is missing under the field and puts focus there, and the shipped rules come back only
  after a second press.
- The page: a pin is on the results while it is typed and the store is unchanged, saving it keeps
  the same results and says the edited set is in effect, closing the panel takes the draft off
  the page, and the way back gives the shipped order.
- In a real browser: the same flow through the service worker, the saved set outliving a reload,
  and an audit of the page with the panel open.
