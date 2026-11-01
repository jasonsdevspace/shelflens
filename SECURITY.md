# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/jasonsdevspace/shelflens/security/advisories/new)
rather than in a public issue.

## Supported versions

The engine, `@jasonsdevspace/shelflens`, gets fixes in a new release on npm's `latest` tag. Older
versions and prereleases are not patched, so upgrade to pick up a fix. The API, the server and the
storefront are not published as packages. Their fixes land on main and in the live demo.

## What is in scope

This is a demonstration project, not a deployed service. Reports about the code are welcome,
especially anything that shows one customer group a price or a product meant for another, gets
past the API's query limits, or lets a crafted query do more work than the limits allow.

## Dependencies and licenses

What ships is the engine, which depends on nothing, and the demo's pages, which carry React and
GraphQL, all under the MIT license. The tools used to build and check the project are not shipped.
Among them, the accessibility checker and a CSS parser are under the Mozilla Public License, and a
lint plugin is under the GNU Lesser General Public License. Both are accepted for tools that run
only in development. A moderate advisory in a pattern matcher the lint tools depend on waits for
those tools to take its fix, and touches nothing that ships.
