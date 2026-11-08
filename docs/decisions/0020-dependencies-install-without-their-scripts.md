# 20. Dependencies install without their scripts

**Status:** accepted

## Context

Every job in CI installed its dependencies with `npm ci`, which runs each package's install
scripts. A package's script runs with the job's files and token in reach, so one compromised
release of any dependency, or of anything one depends on, would run code in every job, the job
that builds the engine package npm publishes among them. Nothing ShelfLens depends on needs its
script to work: the only one in the tree is the repository's own `prepare`, which sets up the
commit hooks for someone working on it and does nothing in CI. The design kit already installs
everything with `--ignore-scripts`, in its record 1, and holds its workflows to it.

## Options

**Allow scripts, as npm does by default.** Nothing to change, and a package that needs a script
works without anyone knowing it has one. Every dependency's script runs in every job, including the
job whose tarball is published.

**Allow scripts for a list of packages.** The packages that need one run it, and no others. The list
has to be kept, and today it would be empty.

**Skip every install script.** No dependency runs code when it is installed. A package that later
needs its script is noticed when it fails, and has its script run by name in the step that needs
it.

## Decision

**Skip every install script.** Each `npm ci` in CI passes `--ignore-scripts`, and so does the oldest
Node job's install of the packed engine into an empty project, which is also how someone installing
it from npm with scripts off gets it. A package that comes to need its script has it run by name,
with `npm rebuild <package>`, in the one step that needs it, with a comment that says why.

## Consequences

- No dependency's install script runs in CI, so a compromised release of one cannot run code there
  by being installed.
- The commit hooks are not set up in CI, which never commits.
- A future package that needs its script fails the job that loads it, rather than working without
  anyone knowing it ran code, and has its script run by name there.

## How it is tested

- `scripts/workflows.test.ts` holds every install in the workflows, in any of npm's spellings, to
  `--ignore-scripts`.
- Every job in CI builds and tests with scripts off, so a package that needed one would fail it.
