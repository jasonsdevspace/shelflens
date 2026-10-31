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
