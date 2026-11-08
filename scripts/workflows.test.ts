import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lookupText, readJson } from './json.js';

/*
 * What the workflows promise that only reading them can hold: a name for
 * every job a reviewer sees in the checks, the screenshots taken in the
 * image of the Playwright the tests pin, a browser installed without the
 * system packages the runner already has and within a time of its own, an
 * engine published only as the tarball the oldest Node check proved, and a
 * release on GitHub named for the part of the project it is.
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

/** One step of a workflow: how far its dash is indented, and its lines. */
interface Step {
    readonly indent: string;
    readonly text: string;
}

/**
 * A workflow's steps, each with its lines, read without comments or Windows line ends. A comment
 * after a value is dropped as well as a line of one, so a step that mentions a flag in a comment
 * is not taken for using it.
 */
const stepsOf = (text: string): Step[] =>
    [
        ...`${text}\n`
            .replace(/\r\n/g, '\n')
            .replace(/^[ \t]*#.*\n/gm, '')
            .replace(/[ \t]+#[ \t].*$/gm, '')
            .matchAll(/^( *)- .*\n(?:\1 {2}.*\n|[ \t]*\n)*/gm),
    ].map(([step = '', indent = '']) => ({ indent, text: step }));

/** Whether a step installs a browser, by the Playwright package or command it runs. */
const installsBrowser = ({ text }: Step) =>
    /(?:@playwright\/test|playwright(?:-core)?)(?:@\S+)?\s+install\b/.test(text);

/** Whether the step has a time limit of its own, as a key of the step and not of an input. */
const hasOwnTimeLimit = ({ indent, text }: Step) =>
    new RegExp(`^${indent} {2}timeout-minutes: ['"]?[1-5]['"]?\\s*$`, 'm').test(text);

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

    it('run every job on a named image, within a time limit of its own', () => {
        const unready = files.flatMap((file) =>
            [...jobsOf(read(file))]
                // A job that calls another workflow takes the image and the time limits of the
                // jobs in it.
                .filter(([, lines]) => !/^ {8}uses:/m.test(lines))
                .filter(
                    ([, lines]) =>
                        !/^ {8}timeout-minutes: \d+[ \t]*(?:#.*)?$/m.test(lines) ||
                        !/^ {8}runs-on: ubuntu-26\.04[ \t]*(?:#.*)?$/m.test(lines)
                )
                .map(([id]) => `${file}: ${id}`)
        );
        expect(unready).toEqual([]);
    });

    it('take the screenshots in the image of the Playwright the tests pin', () => {
        const pinned = lookupText(
            readJson(join(ROOT, 'package.json')),
            'devDependencies',
            '@playwright/test'
        );
        const image = /mcr\.microsoft\.com\/playwright:v([\d.]+)-/.exec(read('ci.yml'))?.[1];
        expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
        expect(image).toBe(pinned);
    });

    it('install a browser without system packages, and give each install a time of its own', () => {
        const steps = files.flatMap((file) => stepsOf(read(file)));
        // The packages come from Ubuntu's mirror, which has been slow enough to run a job out
        // of time before its tests began, and the runner image already has them.
        expect(steps.filter(({ text }) => /--with-deps|\binstall-deps\b/.test(text))).toEqual([]);
        const installs = steps.filter(installsBrowser);
        expect(installs.length).toBeGreaterThan(0);
        expect(installs.filter((step) => !hasOwnTimeLimit(step))).toEqual([]);
    });

    it('read a step the way GitHub does, whatever the step looks like', () => {
        const [step] = stepsOf(
            [
                '            - run: npx @playwright/test install chromium # not --with-deps',
                '              with:',
                '                  timeout-minutes: 3',
            ].join('\n')
        );
        if (!step) throw new Error('expected a step');
        expect(installsBrowser(step)).toBe(true);
        expect(step.text).not.toMatch(/--with-deps/);
        // A time limit given to an action's input is not the step's own.
        expect(hasOwnTimeLimit(step)).toBe(false);
        const [quoted] = stepsOf("    - run: npx playwright install\n      timeout-minutes: '3'");
        if (!quoted) throw new Error('expected a step');
        expect(hasOwnTimeLimit(quoted)).toBe(true);
        const [core] = stepsOf('    - run: npx playwright-core install chromium');
        if (!core) throw new Error('expected a step');
        expect(installsBrowser(core)).toBe(true);
    });

    // The publishing job holds the token trusted publishing issues, so what it installs is what
    // a release trusts most.
    it('install npm where the engine publishes only from a tarball held to a pinned checksum', () => {
        const installs = stepsOf(jobsOf(read('release.yml')).get('publish') ?? '').filter(
            ({ text }) => /\bnpm install -g\b/.test(text)
        );
        expect(installs.length).toBeGreaterThan(0);
        for (const { text } of installs) {
            expect(text).toMatch(/NPM_INTEGRITY: sha512-[A-Za-z0-9+/]+=*\s*$/m);
            // The digest is compared with the pin, and a mismatch stops the step, before the install.
            const compared = text.search(
                /if \[ "\$got" != "\$NPM_INTEGRITY" \]; then\n\s+echo[^\n]*\n\s+exit 1\n/
            );
            expect(text.indexOf('openssl dgst -sha512')).toBeGreaterThan(-1);
            expect(compared).toBeGreaterThan(text.indexOf('openssl dgst -sha512'));
            expect(compared).toBeLessThan(text.indexOf('npm install -g'));
            expect(text).toMatch(/npm install -g --offline --ignore-scripts "\$tarball"/);
            expect(text).not.toMatch(/npm install -g[^\n]*\bnpm@/);
        }
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
