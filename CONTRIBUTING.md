# Contributing

ShelfLens is a portfolio project, and it is held to the checks below whoever opens a pull request.
Everyone taking part follows the [code of
conduct](https://github.com/jasonsdevspace/.github/blob/main/CODE_OF_CONDUCT.md).

## Setting up and running the checks

[Dev setup](README.md#dev-setup) in the README says how to install and what each check covers.
Before a pull request, run these checks, which CI runs too:

```bash
npm run verify
npm run e2e
npm run budget
npm run lighthouse
```

`npm run e2e` and `npm run lighthouse` build the storefront first, and need
`npx playwright install chromium` the first time. `npm run budget` measures the build they leave,
so it runs after one of them or after `npm run storefront`.

A change to the schema or to the storefront's operations also needs `npm run codegen`, with the
generated types and the persisted operations committed, which CI checks. The screenshot comparison
runs only in CI, in Playwright's own Linux image. When a change moves a picture on purpose, the run
fails and keeps what it took, and `npm run screenshots:accept <run id>` brings those pictures into
the branch to look at and commit. It needs the GitHub command line signed in, and a run of the
branch's last commit.

## Writing

Every file is held to one style, which the prose check enforces: no em dashes, no semicolons joining
clauses, American spelling, no issue numbers in comments, and no notes about the process, such as a
list of what is left to do, in anything a reader sees. A commit message says what changed and why in
plain sentences, with no em dash or semicolon, and names the work rather than whatever tool wrote it,
which the commit message check enforces. Installing with `npm ci` sets that check up as a hook on
each commit, beside one that lints and formats the staged files, and CI runs it on a pull request's
title and body.

## Issues

Issues follow the repository's templates, for a piece of work, a parent issue that holds several,
and a bug. Each piece of work says what is wrong or missing, what is already settled, and criteria a
test or a look can check. A bug says what happens, what should happen, how to see it and where.

## Pull requests

A pull request follows the template. Pull requests are squashed, so the title becomes the commit on
main, and the title and the body both pass the commit message check. The body says what changed and
why, with no counts, no checklist and no notes to the reviewer, and ends with "Closes #N", or "Part
of #N" when the issue has more to do. Every check in CI passes before a pull request is merged, the
browser tests, the screenshot comparison and the Lighthouse audit among them.

## Releasing

[Dev setup](README.md#dev-setup) in the README says how the engine reaches npm and how the
storefront is released.

## Security and accessibility

Report a security issue privately, as the [security policy](SECURITY.md) says, not in a public
issue. Report a barrier to using the demo as the [accessibility statement](ACCESSIBILITY.md) says.
