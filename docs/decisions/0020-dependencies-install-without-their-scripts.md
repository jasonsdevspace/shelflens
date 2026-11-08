# 20. Dependencies install without their scripts

**Status:** accepted

## Context

Each job in CI that builds or tests installed its dependencies with `npm ci`, which runs every
package's install scripts. One compromised release of any dependency, or of anything one depends
on, would have run code in each of those jobs, among them the job that packs the engine npm
publishes, before the checksum that vouches for the tarball is taken, and the job that builds the
deployed site. Nothing in the tree needs its script in CI. The dependencies that carry one are
esbuild and unrs-resolver, whose scripts look for a platform binary npm has already installed as an
optional dependency, and fsevents, which is installed only on macOS. The repository's own `prepare`
sets up the commit hooks for someone working on it, and CI never commits. The design kit made the
same choice in its record 1 and holds its workflows to it with the same kind of test.

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

**Skip every install script.** Each `npm ci` in CI passes `--ignore-scripts`, as the publishing
job's install of its pinned npm already did, and so does the oldest Node job's install of the packed
engine into an empty project. The engine ships no install script of its own, which a test holds,
so that install is the same with scripts on or off. A package that comes to need its script has it
run by name, with `npm rebuild <package>`, in the one step that needs it, with a comment that says
why. Every command that installs or runs install scripts, `npm rebuild` and `npm update` among
them, is found in any of npm's spellings wherever it sits in what a step runs, and `npx`, `npm exec`
and `npm create` run only what the lockfile installs, in the repository, so nothing is fetched and
run with its scripts on.

## Consequences

- No dependency's install script runs in CI, so a compromised release of one cannot run code there
  by being installed.
- The commit hooks are not set up in CI, which never commits.
- A future package that needs its script fails the job that loads it, rather than working without
  anyone knowing it ran code, and has its script run by name there.
- The scripts the tree does carry never run in CI, so a platform binary npm failed to install is not
  fetched there, and the step that loads it fails instead.
- The protection stops at CI. The setup's `npm ci` still runs every script on a developer's machine,
  the commit hooks' included.

## How it is tested

- `scripts/workflows.test.ts` holds every command in the workflows that installs or runs install
  scripts, in any of npm's spellings and wherever it sits in what a step runs, to `--ignore-scripts`,
  the last flag that names it deciding as it does for npm. It holds `npx`, `npm exec` and `npm
create` to the packages and tools the lockfile installs, in the repository, and holds the engine
  to no install script of its own.
- Every job in CI that installs builds and tests with scripts off, so a package that needed one
  would fail it.
