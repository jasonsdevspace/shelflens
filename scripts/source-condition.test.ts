import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOURCE_CONDITION } from '../source-condition.js';
import { readJson, recordAt, textAt } from './json.js';
import { workspacePackages } from './repository.mjs';

/*
 * Every workspace package names its source under the one condition, first,
 * so it wins over the build wherever it is asked for. The type-check configs
 * ask for it and the build configs do not, and no other file writes the
 * condition out instead of importing it.
 */

const root = join(__dirname, '..');
/** Every workspace package, in the folders the root's manifest names: packages/ and apps/. */
const packages = workspacePackages(root).map((path) => join(root, path));

/** The two compiler options this test reads, from a tsconfig. */
const optionsOf = (path: string) => {
    const options = recordAt(readJson(path), 'compilerOptions');
    const conditions = options?.['customConditions'];
    return {
        customConditions: Array.isArray(conditions)
            ? conditions.filter((condition) => typeof condition === 'string')
            : [],
        noEmit: options?.['noEmit'] === true,
    };
};

describe('the source condition', () => {
    it('comes first in every workspace package, naming its source', () => {
        const exporting: string[] = [];
        for (const dir of packages) {
            const entry = recordAt(readJson(join(dir, 'package.json')), 'exports', '.');
            if (!entry) continue;
            exporting.push(dir);
            expect(Object.keys(entry)[0], dir).toBe(SOURCE_CONDITION);
            expect(existsSync(join(dir, textAt(entry, SOURCE_CONDITION) ?? '')), dir).toBe(true);
        }
        // The packages known to export their entry this way, so finding none fails.
        expect(exporting).toEqual(
            expect.arrayContaining([join(root, 'packages/engine'), join(root, 'packages/api')])
        );
    });

    it('is asked for by every type check of the sources, and by no build', () => {
        for (const dir of packages) {
            for (const name of readdirSync(dir).filter((file) => /^tsconfig.*\.json$/.test(file))) {
                const options = optionsOf(join(dir, name));
                const asked = options.customConditions;
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
