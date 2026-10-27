# ShelfLens

A product search experience for ShelfLens, a fictional store. Search as you type, a results page
with facets, merchandising rules, and an explain mode that shows why each result ranked where it
did. The search engine behind it is a package of its own, with no dependencies, that the demo uses
only through its public API.

Everything runs in the browser, so the demo deploys as a static site.

## Dev setup

You need [Node.js 24](https://nodejs.org/) and Git.

```bash
git clone https://github.com/jasonsdevspace/shelflens.git
cd shelflens
npm ci
npm run verify
```

`npm run verify` runs what CI runs: type checking, linting, formatting, a prose check and the
tests. Use `npm test` for watch mode while you work.

## Packages

| Package                                        | What it is                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`@jasonsdevspace/shelflens`](packages/engine) | The search engine: matching, typo tolerance, synonyms, filters, sorting and paging, with no dependencies |
| [`@shelflens/catalog`](packages/catalog)       | A deterministic generator for the store's product catalog                                                |

## License

MIT. See [LICENSE](LICENSE).
