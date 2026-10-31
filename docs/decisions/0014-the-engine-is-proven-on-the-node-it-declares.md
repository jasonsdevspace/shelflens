# 14. The engine is proven on the Node it declares, as a user installs it

**Status:** accepted

## Context

The engine is published with an `engines.node` range. The Node version check lets a published
package start below the Node the project builds on, so moving the build to a newer Node never
drops people using the package on an older one. That promise was only words. CI ran the engine's
tests from source, on the newest release of the build's Node, compiled on the fly by the test
runner. Nothing packed the engine, nothing ran the built package, and nothing ran on the lowest
Node the range admits. A file missing from the tarball, an export lost in the build, or an API
newer than the floor would all have shipped.

## Options

**Tighten the check instead.** Hold a published package's floor to the build's Node unless a job
proves the lower one. The check is shared with repositories that publish nothing, and it would
have to start reading workflow files for this one. It still proves nothing about the tarball.

**Run the test suite on the floor.** The test runner has a Node range of its own, and floors the
engine could declare, such as 20 or 25, fall outside it. It would also test the source rather
than what ships.

**Install the packed package on the floor and use it.** Pack the engine as the release does,
install the tarball into an empty project outside the repository, and run a plain Node script and
a type check against it on the exact lowest version the range admits.

## Decision

**The packed package, on the floor.** A `floor` job in CI first runs publint, the standard
check that a package's exports, types and files point at what it ships. It then packs the engine
on the build's Node, as the release does. It works out the lowest version `engines.node`
admits, down to the patch, and installs that Node from a file holding the exact version. Given the range itself, setup-node
would install the newest Node in it, the opposite of a floor, so the smoke script first checks
that it runs on the version it was meant to. It then checks that the import resolves from the
installed tarball rather than the workspace, and that the tarball holds the build and its types
and none of the tests. It checks that every value export is there. And it checks what a user
sees: a typo, a synonym, a filter, a filter count that keeps the other brand choosable, a price
range and the engine's own error. Last, the types are compiled against the installed package
twice, once as Node resolves them and once as a bundler does. One assignment in them must fail,
so types that quietly became `any` fail the job.

The release workflow runs every CI job, this one included, and publishes only when they pass. A
package that fails on its floor is never published, and the demo is never deployed from one.

## Consequences

- One more CI job, running beside the others, with its own install of the project and of the
  floor's Node.
- The engine's tests compare the smoke script's list of exports with the source, so a new export
  cannot ship unchecked. They also hold the language edition the engine compiles against to what
  its lowest Node runs, which reaches code the smoke script's searches never run.
- The floor is 24, the same major the project builds on, so the job runs on 24.0.0 where CI
  otherwise runs the newest 24. Lowering the floor is a change to `engines.node` that this job then proves.
- The smoke script tests a build made from the same commit as the published one, not the
  published bytes themselves.
- Behavior that depends on the Node release, such as Unicode data behind accent folding, is
  covered only as far as the smoke script's searches reach.

## How it is tested

- `packages/engine/smoke/consumer.mjs` and `types.ts`, run by the `floor` job.
- `packages/engine/smoke/package.test.ts`, run with the other tests: the smoke script's export
  list matches the source, a floor is read from each range form the job accepts and refused for
  any other, the engine's own range gives a floor, and the language edition stays within what that
  floor runs.
