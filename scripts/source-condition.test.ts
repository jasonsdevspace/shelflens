import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOURCE_CONDITION } from '../source-condition.js';

/*
 * Every workspace package names its source under the one condition, first,
 * so it wins over the build wherever it is asked for. The type-check configs
 * ask for it and the build configs do not, and no other file writes the
 * condition out instead of importing it.
 */

const root = join(__dirname, '..');
/** Every workspace package, in the folders the root's manifest names: packages/ and apps/. */
const packages = (
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { workspaces: string[] }
).workspaces
    .map((glob) => join(root, glob.replace(/\/\*$/, '')))
    .flatMap((folder) =>
        readdirSync(folder, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => join(folder, entry.name))
    )
    .filter((dir) => existsSync(join(dir, 'package.json')));

/** A tsconfig's compiler options. They are JSON with comments, which are left out before parsing. */
const optionsOf = (path: string): { customConditions?: string[]; noEmit?: boolean } => {
    const text = readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    return (JSON.parse(text) as { compilerOptions?: object }).compilerOptions ?? {};
};

describe('the source condition', () => {
    it('comes first in every workspace package, naming its source', () => {
        expect(packages.length).toBeGreaterThan(0);
        for (const dir of packages) {
            const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
                exports?: { '.'?: Record<string, string> };
            };
            const entry = manifest.exports?.['.'];
            if (!entry) continue;
            expect(Object.keys(entry)[0], dir).toBe(SOURCE_CONDITION);
            expect(existsSync(join(dir, entry[SOURCE_CONDITION] ?? '')), dir).toBe(true);
        }
    });

    it('is asked for by every type check of the sources, and by no build', () => {
        for (const dir of packages) {
            for (const name of readdirSync(dir).filter((file) => /^tsconfig.*\.json$/.test(file))) {
                const options = optionsOf(join(dir, name));
                const asked = options.customConditions ?? [];
                if (name === 'tsconfig.json' && options.noEmit) {
                    expect(asked, `${dir}/${name}`).toEqual([SOURCE_CONDITION]);
                } else {
                    expect(asked, `${dir}/${name}`).not.toContain(SOURCE_CONDITION);
                }
            }
        }
    });

    it('is written out only where a file cannot import it', () => {
        const writing = execFileSync(
            'git',
            ['grep', '--untracked', '-l', SOURCE_CONDITION, '--', '*.ts', '*.tsx', '*.js', '*.mjs'],
            {
                cwd: root,
                encoding: 'utf8',
            }
        )
            .split('\n')
            .filter(Boolean);
        expect(writing).toEqual(['source-condition.ts']);
    });
});
