/**
 * Decides whether a Dependabot pull request merges by itself once its checks pass.
 *
 * A development dependency moved by a patch or a minor, or a runtime dependency moved by a patch,
 * merges by itself. A runtime minor can change what a visitor gets, and a major or a pinned action
 * can change what the build does, so those wait for a person, as does a security update. A runtime
 * dependency below 1.0 waits too, since semver lets any of its releases break. Only a pull request
 * from one of the groups named below qualifies, since those apply to version updates alone and
 * nothing else in the metadata tells a security update apart. A package with a new releaser since
 * the current version waits, as does a pull request that changes any file but a package manifest
 * or lockfile, so the merge never reaches a change to a workflow. Every update in the pull request
 * has to qualify, and anything the metadata leaves unsaid counts against it.
 *
 * Run by the Dependabot merge workflow with the metadata as JSON in `UPDATED_DEPENDENCIES` and the
 * changed files as a JSON list in `CHANGED_FILES`. It prints `merge=true` or `merge=false` for the
 * step's output, and the reason on standard error and in the step summary.
 */
import { appendFileSync } from 'node:fs';

import { isRunDirectly } from './repository.mjs';

/** The groups in `.github/dependabot.yml` whose pull requests may merge by themselves. */
export const GROUPS = new Set(['prose-check', 'typescript', 'graphql-codegen', 'npm']);

/** Each kind of direct dependency, in words, with the update sizes it may merge by itself at. */
const KINDS = new Map([
    [
        'direct:development',
        {
            words: 'a development dependency',
            sizes: new Set(['version-update:semver-patch', 'version-update:semver-minor']),
        },
    ],
    [
        'direct:production',
        { words: 'a runtime dependency', sizes: new Set(['version-update:semver-patch']) },
    ],
]);

/** Each update size in words. */
const SIZES = new Map([
    ['version-update:semver-patch', 'a patch'],
    ['version-update:semver-minor', 'a minor'],
    ['version-update:semver-major', 'a major'],
]);

/** A file an npm update may change: a package manifest or a lockfile, in any folder. */
const MANIFEST = /(^|\/)package(-lock)?\.json$/;

const LIST = new Intl.ListFormat('en', { type: 'conjunction' });

/**
 * Why an update's kind and size leave it to a person, or nothing when they do not.
 *
 * @param {string} name
 * @param {Record<string, unknown>} update
 * @returns {string | undefined}
 */
const sizeHoldOf = (name, { packageEcosystem, dependencyType, updateType, newVersion }) => {
    if (packageEcosystem !== 'npm_and_yarn') return `${name} is not an npm package`;
    if (dependencyType === 'indirect') return `${name} is an indirect dependency`;
    const kind = typeof dependencyType === 'string' ? KINDS.get(dependencyType) : undefined;
    if (!kind) return `${name} is a dependency of an unknown kind`;
    const size = typeof updateType === 'string' ? SIZES.get(updateType) : undefined;
    if (!size) return `${name} is ${kind.words} moved by an unknown amount`;
    if (typeof updateType !== 'string' || !kind.sizes.has(updateType))
        return `${name} is ${kind.words} moved by ${size}`;
    if (dependencyType !== 'direct:production') return undefined;
    const major = typeof newVersion === 'string' ? /^v?(\d+)\./.exec(newVersion)?.[1] : undefined;
    if (major === undefined) return `${name} is a runtime dependency whose new version is unsaid`;
    return major === '0' ? `${name} is a runtime dependency below 1.0` : undefined;
};

/**
 * Why an update's group or releaser leave it to a person, or nothing when they do not.
 *
 * @param {string} name
 * @param {Record<string, unknown>} update
 * @returns {string | undefined}
 */
const sourceHoldOf = (name, { dependencyGroup, maintainerChanges }) => {
    if (typeof dependencyGroup !== 'string' || dependencyGroup === '')
        return `${name} comes from no group, as a security update does`;
    if (!GROUPS.has(dependencyGroup))
        return `${name} comes from the ${dependencyGroup} group, which is not one that merges by itself`;
    if (maintainerChanges !== false)
        return `${name} has a new releaser since the current version, or may have`;
    return undefined;
};

/**
 * Why one update waits for a person, or nothing when it may merge by itself. Its size is read
 * before its group, so a major from no group is named as a major.
 *
 * @param {unknown} update
 * @returns {string | undefined}
 */
const holdOf = (update) => {
    if (typeof update !== 'object' || update === null) return 'an update is not named';
    const fields = /** @type {Record<string, unknown>} */ (update);
    const { dependencyName } = fields;
    const name = typeof dependencyName === 'string' ? dependencyName : 'an unnamed dependency';
    return sizeHoldOf(name, fields) ?? sourceHoldOf(name, fields);
};

/**
 * Why the changed files leave the pull request to a person, or nothing when they do not.
 *
 * @param {unknown} files
 * @returns {string | undefined}
 */
const fileHoldOf = (files) => {
    if (!Array.isArray(files) || files.length === 0) return 'the changed files could not be read';
    const others = files.filter((file) => typeof file !== 'string' || !MANIFEST.test(file));
    return others.length === 0
        ? undefined
        : `it changes ${LIST.format(others.map(String))}, which is not a package manifest or lockfile`;
};

/**
 * Whether the pull request's updates merge by themselves, and why.
 *
 * @param {unknown} updates
 * @param {unknown} files
 * @returns {{ merge: boolean, reason: string }}
 */
export const decide = (updates, files) => {
    const holds = [
        ...(Array.isArray(updates) && updates.length > 0
            ? updates.map(holdOf)
            : ['the metadata names no update']),
        fileHoldOf(files),
    ].filter((hold) => hold !== undefined);
    return holds.length === 0
        ? {
              merge: true,
              reason: 'Every update is a development patch or minor, or a runtime patch.',
          }
        : { merge: false, reason: `A person merges this, since ${LIST.format(holds)}.` };
};

/**
 * A value read from its JSON, or nothing when it does not parse.
 *
 * @param {string} json
 * @returns {unknown}
 */
const parsed = (json) => {
    try {
        return JSON.parse(json);
    } catch {
        return undefined;
    }
};

const main = () => {
    const { UPDATED_DEPENDENCIES = '', CHANGED_FILES = '', GITHUB_STEP_SUMMARY = '' } = process.env;
    const { merge, reason } = decide(parsed(UPDATED_DEPENDENCIES), parsed(CHANGED_FILES));
    console.error(reason);
    if (GITHUB_STEP_SUMMARY !== '') {
        try {
            appendFileSync(GITHUB_STEP_SUMMARY, `${reason}\n`);
        } catch {
            console.error('The summary could not be written.');
        }
    }
    console.log(`merge=${merge}`);
};

if (isRunDirectly(import.meta.url)) main();
