/**
 * What a check writes to its run's page on GitHub, so a reviewer sees what it found without
 * opening the log: a table or a line, never the log itself, and nothing at all outside a run.
 *
 * Run as `node scripts/summary.mjs playwright <report.json> <title>` after a browser test run, or
 * `node scripts/summary.mjs package <tarball>` after packing. The Lighthouse audit and the size
 * budgets call `lighthouseSummary` and `budgetSummary` themselves. A summary reports a check and never decides it, so the workflow
 * steps that run this carry on when it fails.
 */
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { isRunDirectly } from './repository.mjs';

/**
 * Appends to the run's summary, or does nothing outside a run, where there is none. A summary
 * that cannot be written is said in the log and never thrown, so it cannot decide the check it
 * reports.
 *
 * @param {string} markdown
 * @param {Record<string, string | undefined>} [env]
 */
export const writeSummary = (markdown, env = process.env) => {
    const file = env['GITHUB_STEP_SUMMARY'];
    if (!file) return;
    try {
        appendFileSync(file, markdown);
    } catch (error) {
        console.warn(`The run's summary could not be written: ${String(error)}`);
    }
};

/**
 * A Markdown table, with a bar in a cell escaped so it stays in its cell.
 *
 * @param {readonly string[]} head
 * @param {readonly (readonly string[])[]} rows
 */
export const table = (head, rows) => {
    /** @param {readonly string[]} cells */
    const row = (cells) => `| ${cells.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |\n`;
    return row(head) + row(head.map(() => '---')) + rows.map(row).join('');
};

/**
 * A page as the audit judged it, with what it missed of the gates in the audit's own words. A page
 * the audit stopped before measuring for performance has no performance figures.
 *
 * @typedef {{
 *     path: string,
 *     accessibility: number,
 *     performance?: number,
 *     paint?: number,
 *     shift?: number,
 *     missed: readonly string[],
 * }} LighthousePage
 * @typedef {{ accessibility: number, performance: number, paint: number, shift: number }} LighthouseGates
 */

/**
 * Each page's scores against the gates, and what the audit found it missed.
 *
 * @param {readonly LighthousePage[]} pages
 * @param {LighthouseGates} gates
 */
export const lighthouseSummary = (pages, gates) => {
    const rows = pages.map((page) => [
        page.path,
        String(page.accessibility),
        page.performance === undefined
            ? 'Not measured'
            : String(Math.round(page.performance * 100)),
        page.paint === undefined ? 'Not measured' : `${String(Math.round(page.paint))} ms`,
        page.shift === undefined ? 'Not measured' : page.shift.toFixed(3),
        page.missed.length === 0 ? 'Pass' : `Missed: ${page.missed.join(', ')}`,
    ]);
    if (pages.length === 0) {
        return '### Lighthouse\n\nThe audit stopped before it measured a page.\n';
    }
    return (
        '### Lighthouse\n\n' +
        `Each page on a first visit as a slow phone makes it, held to accessibility ` +
        `${String(gates.accessibility)}, performance ${String(Math.round(gates.performance * 100))} ` +
        `or more, a largest paint within ${String(gates.paint)} ms and a layout shift of ` +
        `${String(gates.shift)} or less.\n\n` +
        table(
            ['Page', 'Accessibility', 'Performance', 'Largest paint', 'Layout shift', 'Result'],
            rows
        )
    );
};

/**
 * @typedef {{ status: string }} PlaywrightTest
 * @typedef {{ title: string, file: string, line: number, tests: PlaywrightTest[] }} PlaywrightSpec
 * @typedef {{ title: string, file: string, specs?: PlaywrightSpec[], suites?: PlaywrightSuite[] }} PlaywrightSuite
 * @typedef {{
 *     config?: { rootDir?: string },
 *     stats: { expected: number, unexpected: number, flaky: number, skipped: number },
 *     suites: PlaywrightSuite[],
 *     errors?: { message?: string }[],
 * }} PlaywrightReport
 */

/**
 * A browser test run's totals in a line, and when a test failed, each failing test by its file and
 * line, and where its report is kept. A run that stopped before its tests says why.
 *
 * @param {PlaywrightReport} report
 * @param {{ title: string, runUrl: string, root?: string }} where `root` is the folder the
 *     report's files are named from, relative to the repository, so each line names a file a reader
 *     can open.
 */
export const playwrightSummary = (report, { title, runUrl, root = '' }) => {
    const { expected, unexpected, flaky, skipped } = report.stats;
    const totals = [
        `${String(expected)} passed`,
        ...(unexpected > 0 ? [`${String(unexpected)} failed`] : []),
        ...(flaky > 0 ? [`${String(flaky)} passed on a retry`] : []),
        ...(skipped > 0 ? [`${String(skipped)} skipped`] : []),
    ].join(', ');
    /** @type {string[]} */
    const failing = [];
    /** @type {string[]} */
    const retried = [];
    /**
     * @param {PlaywrightSuite} suite
     * @param {readonly string[]} groups
     */
    const walk = (suite, groups) => {
        for (const spec of suite.specs ?? []) {
            const name = [...groups, spec.title].join(' › ');
            const line = `- ${name} (\`${join(root, spec.file)}:${String(spec.line)}\`)`;
            if (spec.tests.some((test) => test.status === 'unexpected')) failing.push(line);
            else if (spec.tests.some((test) => test.status === 'flaky')) retried.push(line);
        }
        for (const inner of suite.suites ?? []) walk(inner, [...groups, inner.title]);
    };
    // A file's own suite is named by the file, which each line already gives, so its title is
    // left out of the names.
    for (const suite of report.suites) walk(suite, []);
    // An error outside every test, such as a server that never started, in its first line.
    const stopped = (report.errors ?? [])
        .map((error) => (error.message ?? '').split('\n')[0]?.trim() ?? '')
        .filter((line) => line !== '');
    const lines = [`### ${title}`, ''];
    if (stopped.length > 0) {
        lines.push(
            'The run stopped outside its tests:',
            '',
            ...stopped.map((line) => `- ${line}`),
            ''
        );
    }
    lines.push(`${totals}.`);
    // A test that passed only on a retry is named too, since a run that holds tests to passing the
    // first time fails on one.
    if (failing.length > 0 || retried.length > 0 || stopped.length > 0) {
        if (failing.length > 0) lines.push('', 'Failed:', '', ...failing);
        if (retried.length > 0) lines.push('', 'Passed only on a retry:', '', ...retried);
        lines.push(
            '',
            `The report, with each failure's trace and screenshot, is in [the run's artifacts](${runUrl}#artifacts).`
        );
    }
    return `${lines.join('\n')}\n`;
};

/**
 * A size in kilobytes to a tenth, as every summary and log line gives one.
 *
 * @param {number} bytes
 */
export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * A part of the build against its budget, gzipped as a server sends it, with anything the budget
 * check found wrong in it.
 *
 * @typedef {{ what: string, size: number, budget: number, problems: readonly string[] }} BudgetPart
 */

/**
 * Each part against its budget, and a bar chart of how much of each budget it uses, since how close
 * each part is reads faster as a picture than as figures.
 *
 * @param {readonly BudgetPart[]} parts
 */
export const budgetSummary = (parts) => {
    const used = parts.map((part) => Math.round((part.size / part.budget) * 100));
    const rows = parts.map((part, index) => [
        part.what,
        kb(part.size),
        kb(part.budget),
        `${String(used[index] ?? 0)}%`,
        part.problems.length === 0 ? 'Pass' : `Missed: ${part.problems.join(', ')}`,
    ]);
    // A chart label is quoted, so a quote in a part's name is left out of its label.
    const labels = parts.map((part) => `"${part.what.replaceAll('"', '')}"`).join(', ');
    const top = Math.max(100, Math.ceil(Math.max(...used, 0) / 10) * 10);
    return (
        '### Size budgets\n\n' +
        "What the build ships, gzipped as a server sends it, against each part's budget.\n\n" +
        table(['Part', 'Gzipped', 'Budget', 'Used', 'Result'], rows) +
        '\n```mermaid\nxychart-beta\n' +
        `    x-axis [${labels}]\n` +
        `    y-axis "Percent of its budget" 0 --> ${String(top)}\n` +
        `    bar [${used.join(', ')}]\n` +
        '```\n'
    );
};

/**
 * @typedef {{ path: string, size: number, gzip: number }} PackedFile
 * @typedef {{ name: string, version: string, size: number, files: PackedFile[] }} Packed
 */

/**
 * The package as npm ships it: its styles and scripts, raw and gzipped, and every file folded away
 * under them.
 *
 * @param {Packed} packed
 * @param {(path: string) => boolean} loads
 */
export const packageSummary = (packed, loads) => {
    /** @param {readonly PackedFile[]} files */
    const rows = (files) => files.map((file) => [file.path, kb(file.size), kb(file.gzip)]);
    return (
        '### Package size\n\n' +
        `\`${packed.name}@${packed.version}\`, ${kb(packed.size)} packed.\n\n` +
        'Its styles and scripts:\n\n' +
        table(['File', 'Raw', 'Gzipped'], rows(packed.files.filter((file) => loads(file.path)))) +
        '\n<details>\n<summary>Every file in the package</summary>\n\n' +
        table(['File', 'Raw', 'Gzipped'], rows(packed.files)) +
        '\n</details>\n'
    );
};

/**
 * The files a packed tarball holds, read from its tar blocks: each file's path inside the package
 * and its bytes. npm packs plain files under `package/`, so only those are read.
 *
 * @param {Buffer} tarball the `.tgz` as npm packed it
 * @returns {{ path: string, bytes: Buffer }[]}
 */
export const filesOf = (tarball) => {
    const tar = gunzipSync(tarball);
    /** @type {{ path: string, bytes: Buffer }[]} */
    const files = [];
    let at = 0;
    // A path too long for the header's own fields comes before its entry in a pax header.
    /** @type {string | undefined} */
    let long;
    while (at + 512 <= tar.length) {
        const header = tar.subarray(at, at + 512);
        if (header.every((byte) => byte === 0)) break;
        const text = (/** @type {number} */ from, /** @type {number} */ to) =>
            header.subarray(from, to).toString('utf8').replace(/\0.*$/s, '');
        const name = text(0, 100);
        const prefix = text(345, 500);
        const size = parseInt(text(124, 136).trim() || '0', 8);
        const type = text(156, 157);
        if (type === 'x') {
            const records = tar.subarray(at + 512, at + 512 + size).toString('utf8');
            long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(records)?.[1];
            at += 512 + Math.ceil(size / 512) * 512;
            continue;
        }
        const path = long ?? (prefix ? `${prefix}/${name}` : name);
        long = undefined;
        if ((type === '0' || type === '') && path.startsWith('package/')) {
            files.push({
                path: path.slice('package/'.length),
                bytes: tar.subarray(at + 512, at + 512 + size),
            });
        }
        at += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
};

/**
 * A packed tarball measured file by file, raw and gzipped, named from its own manifest.
 *
 * @param {string} tarball
 * @returns {Packed}
 */
const packedOf = (tarball) => {
    const files = filesOf(readFileSync(tarball));
    const manifest = files.find((file) => file.path === 'package.json');
    if (!manifest) throw new Error(`${tarball} holds no package.json`);
    /** @type {{ name: string, version: string }} */
    const { name, version } = JSON.parse(manifest.bytes.toString('utf8'));
    return {
        name,
        version,
        size: statSync(tarball).size,
        files: files
            .map(({ path, bytes }) => ({ path, size: bytes.length, gzip: gzipSync(bytes).length }))
            .sort((a, b) => a.path.localeCompare(b.path)),
    };
};

if (isRunDirectly(import.meta.url)) {
    const [kind, first, second] = process.argv.slice(2);
    const runUrl = `${process.env['GITHUB_SERVER_URL'] ?? ''}/${process.env['GITHUB_REPOSITORY'] ?? ''}/actions/runs/${process.env['GITHUB_RUN_ID'] ?? ''}`;
    if (kind === 'playwright' && first && second) {
        /** @type {PlaywrightReport} */
        const report = JSON.parse(readFileSync(first, 'utf8'));
        const root = report.config?.rootDir ? relative(process.cwd(), report.config.rootDir) : '';
        writeSummary(playwrightSummary(report, { title: second, runUrl, root }));
    } else if (kind === 'package' && first) {
        writeSummary(packageSummary(packedOf(first), (path) => /\.(css|js|mjs)$/.test(path)));
    } else {
        console.error('Usage: summary.mjs playwright <report.json> <title> | package <tarball>');
        process.exitCode = 1;
    }
}
