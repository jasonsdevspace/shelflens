/**
 * The export condition each workspace package names its source under.
 *
 * The type checks, the tests, the page's builds and the bundle tests ask for
 * it, so a workspace package is read from its source without being built,
 * and the packages' own builds and anyone installing the published engine
 * never do, so they resolve to the build. It is scoped to the project, since
 * a plain `source` is a condition other projects use for their own sources
 * and would hand them this package's TypeScript.
 *
 * The tsconfigs and the manifests cannot import it, so they write it out, and
 * a test holds every one of them to this name.
 */
export const SOURCE_CONDITION = '@shelflens/source';
