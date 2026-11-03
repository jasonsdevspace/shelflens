/**
 * What the repository checks share: the files to check, how they start, and
 * the workspace's packages.
 *
 * Each check runs from the top of the repository it belongs to, wherever it
 * is started, over tracked files and new ones not yet added, so whatever the
 * repository ignores is skipped too.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository's files a check reads, by path from its top, with their text.
 * Only the paths `wanted` keeps are opened, and a listed folder, such as a
 * submodule, is passed over.
 *
 * @param {string} scriptUrl the checking script's `import.meta.url`
 * @param {(path: string) => boolean} wanted
 * @returns {Map<string, string>}
 */
export const repositoryFiles = (scriptUrl, wanted) => {
    const here = dirname(fileURLToPath(scriptUrl));
    process.chdir(
        execFileSync('git', ['rev-parse', '--show-toplevel'], {
            cwd: here,
            encoding: 'utf8',
        }).trim()
    );
    const listed = execFileSync(
        'git',
        ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        }
    ).split('\0');
    const paths = [...new Set(listed)].filter(
        (path) =>
            path !== '' &&
            wanted(path) &&
            statSync(path, { throwIfNoEntry: false })?.isFile() === true
    );
    return new Map(paths.map((path) => [path, readFileSync(path, 'utf8')]));
};

/**
 * Whether a script was run directly rather than imported, compared by real
 * path so a checkout reached through a symlink still runs.
 *
 * @param {string} scriptUrl the script's `import.meta.url`
 * @returns {boolean}
 */
export const isRunDirectly = (scriptUrl) =>
    process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(scriptUrl);

/**
 * Every workspace package, as its path from the root, in the folders the
 * root's manifest names: a folder ending in `/*` stands for each folder in
 * it, and any other names one package. A folder with no manifest, such as
 * one left behind by another branch, is not a package.
 *
 * @param {string} root the repository's root, as a path
 * @returns {string[]}
 */
export const workspacePackages = (root) => {
    /** @type {{ workspaces?: string[] }} */
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return (manifest.workspaces ?? [])
        .flatMap((entry) => {
            const folder = entry.replace(/\/\*$/, '');
            if (folder === entry) return [entry];
            return readdirSync(join(root, folder), { withFileTypes: true })
                .filter((child) => child.isDirectory())
                .map((child) => `${folder}/${child.name}`);
        })
        .filter((path) => existsSync(join(root, path, 'package.json')));
};
