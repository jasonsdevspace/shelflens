import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

    it('take the screenshots in the image of the Playwright the tests pin', () => {
        const pinned = (
            JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
                devDependencies: Record<string, string>;
            }
        ).devDependencies['@playwright/test'];
        const image = /mcr\.microsoft\.com\/playwright:v([\d.]+)-/.exec(read('ci.yml'))?.[1];
        expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
        expect(image).toBe(pinned);
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
        expect(jobs.get('engine-release')).toContain('"ShelfLens engine $VERSION"');
        expect(jobs.get('storefront')).toContain('"ShelfLens storefront $VERSION"');
        expect(jobs.get('engine-release')).toMatch(
            /NOTES_LEAD: .*`npm install @jasonsdevspace\/shelflens@\$\{\{ needs\.agree\.outputs\.version \}\}`/
        );
    });
});
