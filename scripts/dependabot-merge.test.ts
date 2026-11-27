// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { decide, GROUPS } from './dependabot-merge.mjs';

/** One updated dependency as Dependabot's metadata names it, a development patch from a group. */
const update = (overrides: Record<string, unknown> = {}) => ({
    dependencyName: 'vitest',
    dependencyType: 'direct:development',
    updateType: 'version-update:semver-patch',
    packageEcosystem: 'npm_and_yarn',
    dependencyGroup: 'npm',
    newVersion: '4.1.2',
    maintainerChanges: false,
    ...overrides,
});

/** The files a grouped npm update changes. */
const FILES = ['package.json', 'package-lock.json'];

const runtime = (overrides: Record<string, unknown> = {}) =>
    update({ dependencyName: 'react', dependencyType: 'direct:production', ...overrides });

const script = fileURLToPath(new URL('./dependabot-merge.mjs', import.meta.url));

/** The groups under one update's `groups:` key, by name, each with the lines under it. */
const groupsIn = (block: string, groups: Map<string, string>) => {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => /^\s*groups:\s*$/.test(line));
    if (at < 0) return;
    const indentOf = (line: string) => line.length - line.trimStart().length;
    const base = indentOf(lines[at] ?? '');
    let name: string | undefined;
    for (const line of lines.slice(at + 1).filter((each) => !/^\s*(?:#.*)?$/.test(each))) {
        if (indentOf(line) <= base) break;
        const heading = /^\s*([\w-]+):\s*$/.exec(line)?.[1];
        if (heading && indentOf(line) === base + 4) name = heading;
        if (name)
            groups.set(name, `${groups.get(name) ?? ''}${heading === name ? '' : `${line}\n`}`);
    }
};

/**
 * Each group in the npm updates of a Dependabot settings file, by its name, with the lines under
 * it. Read by indentation, as the file is written, so the test needs no parser of its own.
 */
const npmGroupsOf = (text: string) => {
    const groups = new Map<string, string>();
    const blocks = `\n${text.replace(/\r\n/g, '\n')}`.split(/\n\s*- package-ecosystem:/).slice(1);
    for (const block of blocks.filter((each) => /^\s*npm\s*\n/.test(each))) groupsIn(block, groups);
    return groups;
};

describe('the Dependabot merge decision', () => {
    it('merges a development patch or minor, and a runtime patch', () => {
        expect(decide([update()], FILES).merge).toBe(true);
        expect(decide([update({ updateType: 'version-update:semver-minor' })], FILES).merge).toBe(
            true
        );
        expect(decide([runtime()], FILES).merge).toBe(true);
    });

    it('merges a development minor below 1.0, as the split allows', () => {
        const zero = update({ updateType: 'version-update:semver-minor', newVersion: '0.9.0' });
        expect(decide([zero], FILES).merge).toBe(true);
    });

    it('leaves a runtime minor and every major to a person, in plain words', () => {
        const minor = decide([runtime({ updateType: 'version-update:semver-minor' })], FILES);
        expect(minor.merge).toBe(false);
        expect(minor.reason).toContain('react is a runtime dependency moved by a minor');
        const major = decide([update({ updateType: 'version-update:semver-major' })], FILES);
        expect(major.merge).toBe(false);
        expect(major.reason).toContain('vitest is a development dependency moved by a major');
        expect(major.reason).not.toMatch(/version-update|direct:|security/);
    });

    it('describes a major from no group by its size, not as a security update', () => {
        const decision = decide(
            [update({ updateType: 'version-update:semver-major', dependencyGroup: '' })],
            FILES
        );
        expect(decision.reason).toContain('moved by a major');
        expect(decision.reason).not.toContain('security');
    });

    it('leaves a runtime update below 1.0 to a person, and one whose new version is unsaid', () => {
        const zero = decide([runtime({ newVersion: '0.4.2' })], FILES);
        expect(zero.merge).toBe(false);
        expect(zero.reason).toContain('below 1.0');
        expect(decide([runtime({ newVersion: 'v0.4.2' })], FILES).merge).toBe(false);
        expect(decide([runtime({ newVersion: '' })], FILES).merge).toBe(false);
        expect(decide([runtime({ newVersion: undefined })], FILES).merge).toBe(false);
        expect(decide([runtime({ newVersion: '10.0.1' })], FILES).merge).toBe(true);
    });

    it('leaves a package with a new releaser to a person, and one where that is unsaid', () => {
        const changed = decide([update({ maintainerChanges: true })], FILES);
        expect(changed.merge).toBe(false);
        expect(changed.reason).toContain('new releaser since the current version');
        expect(decide([update({ maintainerChanges: undefined })], FILES).merge).toBe(false);
    });

    it('leaves a whole group to a person when one update in it does not qualify', () => {
        const decision = decide(
            [
                update(),
                update({ dependencyName: 'eslint' }),
                runtime({ updateType: 'version-update:semver-minor' }),
            ],
            FILES
        );
        expect(decision.merge).toBe(false);
        expect(decision.reason).toContain('react');
    });

    it('joins several reasons as a sentence', () => {
        const decision = decide(
            [
                update({ updateType: 'version-update:semver-major' }),
                runtime({ updateType: 'version-update:semver-minor' }),
                update({ dependencyName: 'eslint', maintainerChanges: true }),
            ],
            FILES
        );
        expect(decision.reason).toMatch(/major, react .* minor, and eslint has a new releaser/);
    });

    it('leaves an update from no group, or from a group not listed, to a person', () => {
        const none = decide([update({ dependencyGroup: '' })], FILES);
        expect(none.merge).toBe(false);
        expect(none.reason).toContain('comes from no group, as a security update does');
        expect(decide([update({ dependencyGroup: undefined })], FILES).merge).toBe(false);
        const other = decide([update({ dependencyGroup: 'actions' })], FILES);
        expect(other.merge).toBe(false);
        expect(other.reason).toContain('the actions group');
    });

    it('leaves an indirect dependency, and one of unknown kind, to a person', () => {
        expect(decide([update({ dependencyType: 'indirect' })], FILES).reason).toContain(
            'vitest is an indirect dependency'
        );
        expect(decide([update({ dependencyType: undefined })], FILES).merge).toBe(false);
    });

    it('leaves an action, or any ecosystem but npm, to a person', () => {
        expect(decide([update({ packageEcosystem: 'github_actions' })], FILES).merge).toBe(false);
        expect(decide([update({ packageEcosystem: 'docker' })], FILES).merge).toBe(false);
    });

    it('leaves an update of unknown size to a person', () => {
        expect(decide([update({ updateType: '' })], FILES).merge).toBe(false);
        expect(decide([update({ updateType: undefined })], FILES).merge).toBe(false);
    });

    it('merges only a pull request that changes nothing but package manifests and lockfiles', () => {
        expect(decide([update()], ['demo/package.json', 'demo/package-lock.json']).merge).toBe(
            true
        );
        const workflow = decide([update()], [...FILES, '.github/workflows/ci.yml']);
        expect(workflow.merge).toBe(false);
        expect(workflow.reason).toContain('.github/workflows/ci.yml');
        expect(decide([update()], ['package.json.bak']).merge).toBe(false);
        expect(decide([update()], ['my-package.json']).merge).toBe(false);
        expect(decide([update()], []).merge).toBe(false);
        expect(decide([update()], undefined).merge).toBe(false);
        expect(decide([update()], [7]).merge).toBe(false);
    });

    it('merges nothing from metadata that names no update or is not a list', () => {
        expect(decide([], FILES).merge).toBe(false);
        expect(decide({}, FILES).merge).toBe(false);
        expect(decide(null, FILES).merge).toBe(false);
        expect(decide([null], FILES).merge).toBe(false);
    });

    it('lists only groups the Dependabot settings hold for npm, none of them for security updates', () => {
        const settings = readFileSync(
            new URL('../.github/dependabot.yml', import.meta.url),
            'utf8'
        );
        const groups = npmGroupsOf(settings);
        expect(GROUPS.size).toBeGreaterThan(0);
        for (const name of GROUPS) {
            expect(groups.has(name), `${name} is a group in dependabot.yml`).toBe(true);
            expect(groups.get(name), `${name} applies to version updates alone`).not.toMatch(
                /applies-to:\s*['"]?security-updates/
            );
        }
        // The reading itself: a group of another ecosystem is not taken for an npm one.
        expect(groups.has('actions')).toBe(false);
        const sample =
            'updates:\n    - package-ecosystem: npm\n      groups:\n          safe:\n              patterns: ["*"]\n          fixes:\n              applies-to: security-updates\n';
        expect([...npmGroupsOf(sample).keys()]).toEqual(['safe', 'fixes']);
        expect(npmGroupsOf(sample).get('fixes')).toMatch(/applies-to: security-updates/);
    });

    it('prints its answer as a step output, and says why in the log and the summary', () => {
        const folder = mkdtempSync(join(tmpdir(), 'dependabot-merge-'));
        const summary = join(folder, 'summary.md');
        try {
            const run = (json: string, files = JSON.stringify(FILES)) =>
                spawnSync(process.execPath, [script], {
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        UPDATED_DEPENDENCIES: json,
                        CHANGED_FILES: files,
                        GITHUB_STEP_SUMMARY: summary,
                    },
                });
            const yes = run(JSON.stringify([update()]));
            expect(yes.status).toBe(0);
            expect(yes.stdout).toBe('merge=true\n');
            expect(yes.stderr).not.toBe('');
            const no = run(JSON.stringify([update({ updateType: 'version-update:semver-major' })]));
            expect(no.status).toBe(0);
            expect(no.stdout).toBe('merge=false\n');
            expect(no.stderr).toContain('vitest');
            expect(readFileSync(summary, 'utf8')).toContain('vitest is a development dependency');
            expect(run('not json').stdout).toBe('merge=false\n');
            expect(run('').stdout).toBe('merge=false\n');
            expect(run(JSON.stringify([update()]), '').stdout).toBe('merge=false\n');
            expect(run(JSON.stringify([update()]), 'not json').stdout).toBe('merge=false\n');
        } finally {
            rmSync(folder, { recursive: true, force: true });
        }
    });

    it('still answers when the summary cannot be written', () => {
        const run = spawnSync(process.execPath, [script], {
            encoding: 'utf8',
            env: {
                ...process.env,
                UPDATED_DEPENDENCIES: JSON.stringify([update()]),
                CHANGED_FILES: JSON.stringify(FILES),
                GITHUB_STEP_SUMMARY: join(tmpdir(), 'no-such-folder-here', 'summary.md'),
            },
        });
        expect(run.status).toBe(0);
        expect(run.stdout).toBe('merge=true\n');
    });
});
