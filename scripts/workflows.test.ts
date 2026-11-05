import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lookupText, readJson } from './json.js';

/*
 * What the workflows promise that only reading them can hold: a name for
 * every job a reviewer sees in the checks, the screenshots taken in the
 * image of the Playwright the tests pin, and an engine published only as
 * the tarball the oldest Node check proved, and a release on GitHub named
 * for the part of the project it is.
 */

const ROOT = join(import.meta.dirname, '..');
const WORKFLOWS = join(ROOT, '.github/workflows');
const read = (name: string) => readFileSync(join(WORKFLOWS, name), 'utf8');

/** Each job in a workflow, by its id, with the lines that belong to it. */
const jobsOf = (text: string): Map<string, string> => {
    const start = /^jobs:[ \t]*(?:#.*)?\r?\n/m.exec(text);
    if (!start) throw new Error('a workflow without a jobs: line, which this test cannot read');
    const body = text.slice(start.index + start[0].length).replace(/\r\n/g, '\n');
    const jobs = new Map<string, string>();
    for (const match of body.matchAll(/^ {4}([a-z][\w-]*):\n((?:(?: {8}.*| *#.*|)\n)*)/gm)) {
        jobs.set(match[1] ?? '', match[2] ?? '');
    }
    return jobs;
};

describe('the workflows', () => {
    const files = readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name));

    it('give every job a name that says what it does, not only its id', () => {
        const unnamed = files.flatMap((file) =>
            [...jobsOf(read(file))]
                .filter(([, lines]) => !/^ {8}name: \S/m.test(lines))
                .map(([id]) => `${file}: ${id}`)
        );
        expect(files.length).toBeGreaterThan(0);
        expect(unnamed).toEqual([]);
    });

    it('run every browser in the image of the Playwright the tests pin', () => {
        const pinned = lookupText(
            readJson(join(ROOT, 'package.json')),
            'devDependencies',
            '@playwright/test'
        );
        const ci = read('ci.yml');
        const images = [...ci.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/g)].map(
            ([, version]) => version
        );
        expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
        expect(images).toEqual(['browser', 'lighthouse', 'visual'].map(() => pinned));
        for (const job of ['browser', 'lighthouse', 'visual']) {
            expect(jobsOf(ci).get(job)).toMatch(/image: mcr\.microsoft\.com\/playwright:v/);
        }
        // A browser installed on the runner comes from Ubuntu's mirror, which has been slow
        // enough to run a job out of time.
        expect(ci).not.toMatch(/playwright install/);
    });

    it('publish only the tarball whose checksum the oldest Node check reported', () => {
        const ci = read('ci.yml');
        const release = read('release.yml');
        expect(ci).toMatch(/engine-sha256:[\s\S]*?value: \$\{\{ jobs\.floor\.outputs\.sha256 \}\}/);
        const floor = jobsOf(ci).get('floor') ?? '';
        // Into a variable first, so a checksum that fails fails the step.
        expect(floor).toMatch(/sum=\$\(sha256sum /);
        expect(floor).toContain('echo "sha256=$sum" >> "$GITHUB_OUTPUT"');
        const publish = jobsOf(release).get('publish') ?? '';
        expect(publish).toContain('SHA256: ${{ needs.checks.outputs.engine-sha256 }}');
        // Checked before anything is staged.
        expect(publish.indexOf('sha256sum -c -')).toBeGreaterThan(0);
        expect(publish.indexOf('sha256sum -c -')).toBeLessThan(
            publish.indexOf('npm stage publish')
        );
    });

    it('name each release on GitHub for the part of the project it is, and the engine for its npm name too', () => {
        const jobs = jobsOf(read('release.yml'));
        /** The step of a job that runs the release script, from its name to the next step. */
        const releaseStep = (job: string) =>
            (jobs.get(job) ?? '')
                .split(/\n(?= {12}- name: )/)
                .find((step) => step.includes('scripts/github-release.sh')) ?? '';
        const engine = releaseStep('engine-release');
        expect(engine).toMatch(
            /scripts\/github-release\.sh [^\n]*\\\n\s+"ShelfLens engine \$VERSION"/
        );
        // The lead is set in the same step, before the script runs, from the package's own name.
        expect(engine).toContain('package="$(jq -r .name packages/engine/package.json)"');
        expect(engine).toMatch(/export NOTES_LEAD=.*npm install \$package@\$VERSION/);
        expect(engine.indexOf('export NOTES_LEAD=')).toBeLessThan(
            engine.indexOf('scripts/github-release.sh')
        );
        expect(releaseStep('storefront')).toMatch(
            /scripts\/github-release\.sh [^\n]*\\\n\s+"ShelfLens storefront \$VERSION"/
        );
    });

    it('run the same checks in CI as `npm run verify` runs, each in a step of its own', () => {
        /** A command as written in either place, without the npx a CI step runs it through. */
        const commands = (line: string) =>
            line.split(' && ').map((command) => command.trim().replace(/^npx /, ''));
        const verify = lookupText(readJson(join(ROOT, 'package.json')), 'scripts', 'verify');
        const job = jobsOf(read('ci.yml')).get('verify') ?? '';
        // The checks, by the names a failed run shows, each with the command its step runs.
        const steps = [
            'Type-check',
            'Lint',
            'Format check',
            'Prose check',
            'Node version check',
            'Check for unused exports and dependencies',
            'Unit tests',
        ].map((name) => {
            const run = new RegExp(`- name: ${name}\\n\\s+run: (.+)`).exec(job)?.[1];
            if (run === undefined) throw new Error(`the verify job has no step named ${name}`);
            return run;
        });
        expect(steps.flatMap(commands)).toEqual(commands(verify ?? ''));
    });

    it('release each tag from the folder its package is in', () => {
        const agree = jobsOf(read('release.yml')).get('agree') ?? '';
        for (const [prefix, name] of [
            ['engine-v', 'engine'],
            ['storefront-v', 'storefront'],
        ] as const) {
            const dir = new RegExp(`${prefix}\\*\\) package=${name} dir=(\\S+) ;;`).exec(
                agree
            )?.[1];
            expect(dir, prefix).toBeDefined();
            // The folder holds the package the tag names, with the changelog its notes come from.
            expect(
                lookupText(readJson(join(ROOT, dir ?? '', 'package.json')), 'name'),
                prefix
            ).toBe(name === 'engine' ? '@jasonsdevspace/shelflens' : '@shelflens/storefront');
            expect(readFileSync(join(ROOT, dir ?? '', 'CHANGELOG.md'), 'utf8'), prefix).toContain(
                '## '
            );
        }
    });
});
