# 13. A visitor's catalog stays in the browser, in a store of its own

**Status:** accepted

## Context

The engine takes any documents, but the demo only ever searches the catalog the project
generates, so the package's reach has to be taken on trust. Release 2 ends with a page at `try/`
where a visitor loads a file of their own products and searches it in the same storefront. Three
things constrain it. The demo at the site's root has to keep working exactly as it does, its
worker, caches, rules and deep links included, whatever a visitor loads. Nothing a visitor loads
may leave their browser, since there is no server and the page says there is none. And the
storefront, its schema and its persisted operations are built for one shape of product.

## Options

**Where the visitor's store runs.** One worker that switches between the demo's catalog and the
visitor's. Or the same worker script registered a second time, under the scope `try/`, serving
only the visitor's.

**What a visitor's file becomes.** Products of the shape the store already has, with each
column mapped onto a part of a product. Or a generic schema, where any column can be a field and
the storefront renders whatever it is given.

**Where the file is read.** In the worker, which receives the raw file. Or in the page, which
reads, maps and checks it, and hands the worker a catalog.

## Decision

A second registration, products of the existing shape, and the file read in the page.

**A store of its own.** One worker that switched catalogs would break the demo the moment a
visitor loaded a file: the tour names the demo's products, a deep link to one would find
nothing, and a tab on the demo and a tab on `try/` would fight over one store. The same script
registered under `try/` with `?store=try` is a second worker the browser keeps apart, since it
gives each page the registration with the longest matching scope. Caches and databases are named
for the whole site, not for a scope, so the visitor's worker keeps its answers, events, rules
and catalog under names of its own. The demo keeps the names it always had.

**The shape the store already has.** A generic schema would mean new generated types, new
persisted operations and every component rewritten, for a page whose point is that the same
storefront serves the visitor's products. Mapping onto the existing product shape can be undone
by deleting the page, and the parts no column feeds get stated defaults: "Unbranded", one
category, the guest price for members, in stock, and both customer groups. When no member price
differs, the page hides the group switch rather than show one that changes nothing.

**Read in the page, kept by the worker.** The page needs the rows anyway, to say what it found
and which column feeds what, so it reads the file, guesses the mapping from the headers and the
values, and builds the catalog. It sends the catalog to the worker on a `catalog` path, and the
worker checks it as a server checks a request before keeping the only copy in IndexedDB and
building a store from it. The worker sets the catalog's version from its content, so a second
file can never be answered from what the first one left in a cache, and the same file loaded
again keeps its answers.

## Consequences

- The cap on a visitor's catalog is ten thousand products, the largest size the
  [catalog size benchmark](../benchmarks/catalog-size.md) found to answer within the popover's
  budget and start its store within two seconds on a phone. A file past it is refused with its
  count, and a file far past it is refused before it is read.
- No dependency reads the CSV. A spreadsheet's grammar is small, the page has a budget, and a
  hand reader covers quoted separators and line breaks, doubled quotes, a byte order mark,
  uneven rows and a semicolon or tab separator.
- A price reads only when its cell is one, by the decimal mark its column uses, and a row that
  cannot be a product is left out and named by its place in the file. A guess can be wrong, and
  the page shows it before the visitor searches.
- Every change to the visitor's store runs one at a time, and a catalog the store cannot be
  built from is not kept. Loading a new catalog forgets the last one's saved rules and clicks,
  since they name its products. A file with no id column numbers its products by their place,
  so a kept rule would pin whatever row moved into that place. The worker refuses a new file or
  a removal that would discard a visitor's saved rules unless the request says the visitor
  agreed, deciding in the same turn as the change, so a rule saved in another tab a moment
  before is never lost unasked. The same file loaded again names the same products, so its
  rules and clicks are kept and nothing is asked. The page asks then, and a visitor who keeps
  them is taken back to the products and the search they left.
- The rules editor works on a visitor's store as it does on the demo's. The store over a
  visitor's catalog ships no rules, so discarding them leaves none. A save builds the store
  again, which at the cap costs about what a cold start's build does, a third of a second on a
  laptop and about a second and a quarter slowed for a phone, by the
  [catalog size benchmark](../benchmarks/catalog-size.md), inside its two-second budget.
- The page for a visitor's catalog runs only on the built site, where its worker does. The dev
  server answers the demo's API and nothing else.

## How it is tested

- The readers, the guessed mapping and the conversion, each case a test, and a store built from
  the sample file that answers a search, a filter count and a member price.
- The worker's catalog path: nothing to search before a load, a load answered from, a second
  catalog with nothing of the first served, a refused catalog leaving the last in place, and a
  load and a removal arriving together.
- In a real browser, the sample loaded as a visitor would, then a suggestion, a filter, a sort,
  a second page, explain mode and a product, with every request on the page's own origin and
  the file's contents reaching only this page's worker, and the demo beside it unchanged.
- In a real browser, a made-up file the demo does not have: a product pinned and shown pinned
  in explain mode, saved, kept across a reload and absent from the demo, the question when a
  new file would replace them, kept and then answered yes, and the rules gone once it is loaded.
  Discarding gives back the engine's order.
