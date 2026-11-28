# 21. Installs follow npm's own settings

**Status:** accepted, and replaces [record 20](0020-dependencies-install-without-their-scripts.md)

## Context

Record 20 kept every dependency's install scripts out of CI by passing `--ignore-scripts` to each
install, and held the workflows to it with a test that read every npm command a step runs. That
protection stopped at CI: the setup's `npm ci` still ran every script on a developer's machine, and
the test had to recognize each way a command can be written in a shell to be sure of an install it
had never seen. The house's repo check, `check-installs` from `@jasonsdevspace/repo-check`, holds a
repository to npm's own settings instead, which npm honors for every install however it is written.

## Options

**Keep the flag on each install in CI, and the test that reads commands.** Nothing to change. The
laptop's installs still run scripts, and the reader has to keep up with every spelling of an
install.

**Set npm's own settings in the repository, and hold them with the shared check.** A `.npmrc` at the
root sets `ignore-scripts=true`, `allow-git=none` and `allow-remote=none`, so npm runs no install
script and fetches no package from git or an address, in CI and on a laptop alike. npm also skips
the repository's own `prepare` and `prepack`, so the hooks and the engine's build run by name.

## Decision

**Set npm's own settings, and hold them with the shared check.** The root `.npmrc` sets the three
settings, `npm run installs` runs `check-installs` in `verify` and in CI, and the engine is built by
name before it is packed, with its `prepack` gone. The setup runs `npm run prepare` after `npm ci`
to set up the commit hooks. The workflow test keeps only what the `.npmrc` cannot cover: an install
where npm reads no project settings, a global one, one given another folder, or one in a job or
step outside the checkout, turns install scripts off itself, and npx, `npm exec` and `npm x` run
only what the lockfile installed.

## Consequences

- No dependency's install script runs on a developer's machine or in CI, and no package is fetched
  from git or an address.
- The hooks are set up by `npm run prepare` after installing, since npm skips `prepare` with install
  scripts off.
- The engine is built by name before every pack, and the pack job fails if the tarball holds no
  `dist`.
- A fix to the rule reaches the repository by moving the repo check's exact pin, which moves in a
  Dependabot group of its own.

## How it is tested

- `check-installs` runs in `verify` and in CI's checks, and fails without the root `.npmrc`.
- `scripts/workflows.test.ts` holds every install where npm reads no project `.npmrc` to
  `--ignore-scripts`, and every npx, `npm exec` and `npm x` to `--no-install`.
- The pack job lists the tarball and fails if it holds no `dist`.
