/**
 * Moves screenshots between a run of the screenshot tests and the folder
 * they are compared with.
 *
 *   node scripts/screenshots.mjs collect
 *   node scripts/screenshots.mjs accept <run id>
 *
 * `collect` runs in CI after the screenshot tests fail. A picture with no
 * match is already written where it belongs, and one that differs is left
 * beside its test as `<name>-actual.png`, so this puts each of those where
 * the picture it differs from lives, ready to upload as one folder.
 *
 * `accept` downloads that folder from a run and puts it in place, so the
 * pictures can be looked at in the diff and committed. It needs the GitHub
 * command line, signed in to the repository.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isRunDirectly } from './repository.mjs';

const STOREFRONT = 'packages/storefront';
export const SCREENSHOTS = join(STOREFRONT, 'e2e', '__screenshots__');
const RESULTS = join(STOREFRONT, 'test-results');
export const ARTIFACT = 'screenshots';

/**
 * Where a differing picture belongs: the project is the end of its test's
 * folder name, and the picture's name is the file's without `-actual`.
 *
 * @param {string} folder
 * @param {string} file
 * @returns {string | undefined}
 */
export const destinationOf = (folder, file) => {
    const project = /-(visual-[a-z]+)(-retry\d+)?$/.exec(folder)?.[1];
    if (project === undefined || !file.endsWith('-actual.png')) return undefined;
    return join(SCREENSHOTS, project, file.replace(/-actual\.png$/, '.png'));
};

const collect = () => {
    if (!existsSync(RESULTS)) return;
    // The results hold a folder per test, beside a file or two of Playwright's own.
    for (const entry of readdirSync(RESULTS, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const folder = entry.name;
        for (const file of readdirSync(join(RESULTS, folder))) {
            const destination = destinationOf(folder, file);
            if (destination) cpSync(join(RESULTS, folder, file), destination);
        }
    }
};

/** @param {string | undefined} run */
const accept = (run) => {
    if (!run || !/^\d+$/.test(run)) {
        console.error('usage: node scripts/screenshots.mjs accept <run id>');
        process.exit(2);
    }
    const into = mkdtempSync(join(tmpdir(), 'shelflens-screenshots-'));
    try {
        execFileSync('gh', ['run', 'download', run, '--name', ARTIFACT, '--dir', into], {
            stdio: 'inherit',
        });
        rmSync(SCREENSHOTS, { recursive: true, force: true });
        cpSync(into, SCREENSHOTS, { recursive: true });
        console.log(
            `The screenshots from run ${run} are in ${SCREENSHOTS}. Look at them, then commit.`
        );
    } finally {
        rmSync(into, { recursive: true, force: true });
    }
};

const main = () => {
    const [, , command, run] = process.argv;
    if (command === 'collect') collect();
    else if (command === 'accept') accept(run);
    else {
        console.error('usage: node scripts/screenshots.mjs collect | accept <run id>');
        process.exit(2);
    }
};

if (isRunDirectly(import.meta.url)) main();
