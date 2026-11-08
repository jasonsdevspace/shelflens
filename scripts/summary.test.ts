import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    budgetSummary,
    filesOf,
    lighthouseSummary,
    packageSummary,
    playwrightSummary,
    table,
    writeSummary,
} from './summary.mjs';

/*
 * What each check writes to its run's page: a table or a line a reviewer reads at a glance, never
 * the log, and nothing at all outside a run.
 */

const made: string[] = [];
afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('a summary', () => {
    it('lays out a table, keeping a cell with a bar in it whole', () => {
        expect(table(['Page', 'Result'], [['/a|b/', 'Pass']])).toBe(
            '| Page | Result |\n| --- | --- |\n| /a\\|b/ | Pass |\n'
        );
    });

    it('appends to the run summary, and writes nothing outside a run', () => {
        const dir = mkdtempSync(join(tmpdir(), 'summary-'));
        made.push(dir);
        const file = join(dir, 'summary.md');
        writeSummary('one\n', { GITHUB_STEP_SUMMARY: file });
        writeSummary('two\n', { GITHUB_STEP_SUMMARY: file });
        expect(readFileSync(file, 'utf8')).toBe('one\ntwo\n');
        expect(() => {
            writeSummary('nowhere\n', {});
        }).not.toThrow();
    });
});

describe('the Lighthouse summary', () => {
    const gates = { accessibility: 100, performance: 0.9, paint: 2500, shift: 0.1 };

    it('gives a row for each page against the gates, with what the audit found it missed', () => {
        const text = lighthouseSummary(
            [
                {
                    path: '/design-kit/',
                    accessibility: 100,
                    performance: 1,
                    paint: 910,
                    shift: 0,
                    missed: [],
                },
                {
                    path: '/design-kit/controls/',
                    accessibility: 96,
                    performance: 0.88,
                    paint: 2600,
                    shift: 0.12,
                    missed: ['accessibility 96', 'performance 88'],
                },
            ],
            gates
        );
        expect(text).toContain('### Lighthouse');
        expect(text).toContain('| /design-kit/ | 100 | 100 | 910 ms | 0.000 | Pass |');
        expect(text).toContain(
            '| /design-kit/controls/ | 96 | 88 | 2600 ms | 0.120 | Missed: accessibility 96, performance 88 |'
        );
        expect(text).toContain('accessibility 100, performance 90 or more');
    });
});

describe('the browser test summary', () => {
    const report = (failing: boolean) => ({
        stats: { expected: failing ? 3 : 4, unexpected: failing ? 1 : 0, flaky: 0, skipped: 1 },
        suites: [
            {
                title: 'site.spec.ts',
                file: 'packages/site/e2e/site.spec.ts',
                specs: [],
                suites: [
                    {
                        title: 'the theme switch',
                        file: 'packages/site/e2e/site.spec.ts',
                        specs: [
                            {
                                title: 'saves a choice',
                                file: 'packages/site/e2e/site.spec.ts',
                                line: 12,
                                tests: [{ status: failing ? 'unexpected' : 'expected' }],
                            },
                        ],
                    },
                ],
            },
        ],
    });

    it('gives the totals in a line when every test passed', () => {
        expect(playwrightSummary(report(false), { title: 'Browser tests', runUrl: 'u' })).toBe(
            '### Browser tests\n\n4 passed, 1 skipped.\n'
        );
    });

    it('names each failing test by its file and line, and links the report', () => {
        const text = playwrightSummary(
            { ...report(true), suites: report(true).suites.map((suite) => ({ ...suite })) },
            {
                title: 'Browser tests',
                runUrl: 'https://github.com/o/r/actions/runs/1',
                failed: true,
            }
        );
        expect(text).toContain('3 passed, 1 failed, 1 skipped.');
        expect(text).toContain(
            '- the theme switch › saves a choice (`packages/site/e2e/site.spec.ts:12`)'
        );
        expect(text).toContain(
            "[the run's artifacts](https://github.com/o/r/actions/runs/1#artifacts)"
        );
    });

    it('names each file from the repository, where the report names it from its test folder', () => {
        const failing = report(true);
        const moved = failing.suites.map((suite) => ({
            ...suite,
            suites: suite.suites.map((inner) => ({
                ...inner,
                specs: inner.specs.map((spec) => ({ ...spec, file: 'site/e2e/site.spec.ts' })),
            })),
        }));
        const text = playwrightSummary(
            { ...failing, suites: moved },
            { title: 'Browser tests', runUrl: 'u', root: 'packages' }
        );
        expect(text).toContain('(`packages/site/e2e/site.spec.ts:12`)');
    });
});

describe('a run that stops outside its tests', () => {
    it('says why, from the report, rather than reading as a clean run of nothing', () => {
        const text = playwrightSummary(
            {
                stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
                suites: [],
                errors: [{ message: 'Error: Process from config.webServer exited early.\n  at x' }],
            },
            { title: 'Browser tests', runUrl: 'u', failed: true }
        );
        expect(text).toContain('The run stopped outside its tests:');
        expect(text).toContain('- Error: Process from config.webServer exited early.');
        expect(text).not.toContain('  at x');
        expect(text).toContain("[the run's artifacts](u#artifacts)");
    });
});

describe('the package summary', () => {
    it('gives what a page loads first, raw and gzipped, and every file folded away', () => {
        const text = packageSummary(
            {
                name: '@o/kit',
                version: '1.0.0',
                size: 20480,
                files: [
                    { path: 'dist/tokens.css', size: 4096, gzip: 1024 },
                    { path: 'dist/react.js', size: 8192, gzip: 2048 },
                    { path: 'dist/react.d.ts', size: 2048, gzip: 512 },
                    { path: 'README.md', size: 6144, gzip: 2560 },
                ],
            },
            (path) => /\.(css|js)$/.test(path)
        );
        expect(text).toContain('### Package size');
        expect(text).toContain('`@o/kit@1.0.0`, 20.0 KB packed.');
        expect(text).toContain('| dist/tokens.css | 4.0 KB | 1.0 KB |');
        expect(text).toContain('| dist/react.js | 8.0 KB | 2.0 KB |');
        expect(text).toMatch(/<details>\n<summary>Every file in the package<\/summary>/);
        expect(text.indexOf('README.md')).toBeGreaterThan(text.indexOf('<details>'));
    });
});

describe('a packed tarball', () => {
    it('is read file by file from its tar blocks, under the package folder', () => {
        const dir = mkdtempSync(join(tmpdir(), 'packed-'));
        made.push(dir);
        mkdirSync(join(dir, 'package', 'dist'), { recursive: true });
        writeFileSync(join(dir, 'package', 'package.json'), '{"name":"@o/kit","version":"1.0.0"}');
        writeFileSync(join(dir, 'package', 'dist', 'tokens.css'), ':root { --a: 1; }\n'.repeat(40));
        const tarball = join(dir, 'kit.tgz');
        execFileSync('tar', ['-czf', tarball, '-C', dir, 'package']);
        const files = filesOf(readFileSync(tarball));
        expect(files.map(({ path }) => path).sort()).toEqual(['dist/tokens.css', 'package.json']);
        expect(files.find(({ path }) => path === 'dist/tokens.css')?.bytes.length).toBe(
            ':root { --a: 1; }\n'.length * 40
        );
    });
});

describe('the budget summary', () => {
    it('gives each part against its budget, and charts how much of each budget it uses', () => {
        const text = budgetSummary([
            { what: 'the page', size: 94 * 1024, budget: 104 * 1024, problems: [] },
            {
                what: 'the page for a visitor’s catalog',
                size: 116 * 1024,
                budget: 115 * 1024,
                problems: ['past its budget'],
            },
        ]);
        expect(text).toContain('### Size budgets');
        expect(text).toContain('| the page | 94.0 KB | 104.0 KB | 90% | Pass |');
        expect(text).toContain(
            '| the page for a visitor’s catalog | 116.0 KB | 115.0 KB | 101% | Missed: past its budget |'
        );
        expect(text).toContain('```mermaid\nxychart-beta');
        expect(text).toContain('x-axis ["the page", "the page for a visitor’s catalog"]');
        expect(text).toContain('bar [90, 101]');
        expect(text).toContain('y-axis "Percent of its budget" 0 --> 110');
    });

    it("keeps a quote in a part's name from breaking the chart", () => {
        const text = budgetSummary([
            { what: 'the "widget"', size: 1024, budget: 2048, problems: [] },
        ]);
        expect(text).toContain('x-axis ["the widget"]');
    });
});

describe('a summary that cannot be written', () => {
    it('is said in the log and never thrown, so it cannot fail the check it reports', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            expect(() => {
                writeSummary('text\n', { GITHUB_STEP_SUMMARY: '/nowhere/at/all/summary.md' });
            }).not.toThrow();
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining("The run's summary could not be written")
            );
        } finally {
            warn.mockRestore();
        }
    });
});

describe('a test that passed only on a retry', () => {
    it('is named, with the report linked, since a run that holds tests to the first try fails on it', () => {
        const text = playwrightSummary(
            {
                stats: { expected: 3, unexpected: 0, flaky: 1, skipped: 0 },
                suites: [
                    {
                        title: 'search.spec.ts',
                        file: 'search.spec.ts',
                        specs: [
                            {
                                title: 'answers a typo',
                                file: 'search.spec.ts',
                                line: 7,
                                tests: [{ status: 'flaky' }],
                            },
                        ],
                    },
                ],
            },
            { title: 'Browser tests', runUrl: 'u', root: 'apps/storefront/e2e', failed: true }
        );
        expect(text).toContain('3 passed, 1 passed on a retry.');
        expect(text).toContain('Passed only on a retry:');
        expect(text).toContain('- answers a typo (`apps/storefront/e2e/search.spec.ts:7`)');
        expect(text).toContain('#artifacts');
    });

    it('links no report where the run passed, since CI keeps one only when a run fails', () => {
        const text = playwrightSummary(
            {
                stats: { expected: 3, unexpected: 0, flaky: 1, skipped: 0 },
                suites: [
                    {
                        title: 'a.spec.ts',
                        file: 'a.spec.ts',
                        specs: [
                            {
                                title: 'b',
                                file: 'a.spec.ts',
                                line: 1,
                                tests: [{ status: 'flaky' }],
                            },
                        ],
                    },
                ],
            },
            { title: 'Browser tests', runUrl: 'u' }
        );
        expect(text).toContain('Passed only on a retry:');
        expect(text).not.toContain('#artifacts');
    });
});

describe('an audit that stopped partway', () => {
    const gates = { accessibility: 100, performance: 0.9, paint: 2500, shift: 0.1 };

    it('still gives a page measured for accessibility alone', () => {
        const text = lighthouseSummary(
            [{ path: '/about/', accessibility: 100, missed: ['stopped before performance'] }],
            gates
        );
        expect(text).toContain(
            '| /about/ | 100 | Not measured | Not measured | Not measured | Missed: stopped before performance |'
        );
    });

    it('says it measured nothing, rather than giving an empty table', () => {
        expect(lighthouseSummary([], gates)).toBe(
            '### Lighthouse\n\nThe audit stopped before it measured a page.\n'
        );
    });
});

describe('a packed path too long for the tar header', () => {
    it('is read whole from the pax header before it', () => {
        const dir = mkdtempSync(join(tmpdir(), 'long-'));
        made.push(dir);
        const deep = join('package', 'dist', `${'a'.repeat(160)}`, 'file.css');
        mkdirSync(join(dir, deep, '..'), { recursive: true });
        writeFileSync(join(dir, 'package', 'package.json'), '{"name":"k","version":"1.0.0"}');
        writeFileSync(join(dir, deep), 'a { color: red; }');
        const tarball = join(dir, 'k.tgz');
        execFileSync('tar', ['--format=pax', '-czf', tarball, '-C', dir, 'package']);
        const paths = filesOf(readFileSync(tarball)).map(({ path }) => path);
        expect(paths).toContain(`dist/${'a'.repeat(160)}/file.css`);
    });
});

describe('a packed path written another way', () => {
    /**
     * A tarball of one file at `path` under `package/`, written in the first of `formats` the
     * machine's tar knows, since GNU tar and BSD tar name the GNU format differently.
     */
    const packed = (path: string, ...formats: string[]) => {
        const dir = mkdtempSync(join(tmpdir(), 'format-'));
        made.push(dir);
        mkdirSync(join(dir, 'package', path, '..'), { recursive: true });
        writeFileSync(join(dir, 'package', path), 'a { color: red; }');
        const tarball = join(dir, 'k.tgz');
        const written = formats.some((format) => {
            try {
                execFileSync('tar', [`--format=${format}`, '-czf', tarball, '-C', dir, 'package'], {
                    stdio: 'ignore',
                });
                return true;
            } catch {
                return false;
            }
        });
        if (!written) throw new Error(`tar knows none of ${formats.join(', ')}`);
        return filesOf(readFileSync(tarball)).map(({ path: found }) => found);
    };

    it('reads a long path from the long name entry GNU tar writes', () => {
        const long = `dist/${'b'.repeat(160)}/file.css`;
        expect(packed(long, 'gnu', 'gnutar')).toContain(long);
    });

    it('reads a pax path whole, a newline in it and all', () => {
        // Long enough that tar has to put it in a pax header.
        const path = `dist/${'c'.repeat(160)}/a\nb.css`;
        expect(packed(path, 'pax')).toContain(path);
    });
});
