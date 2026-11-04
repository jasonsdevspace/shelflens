// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/*
 * A lint disable comment turns a rule off where a reader cannot see why, so
 * each one says why on the same line, after the two dashes ESLint reads as
 * its description. ESLint fails the build on one that no longer fires, so
 * none outlives its reason either.
 */

const root = fileURLToPath(new URL('../', import.meta.url));

/** Every file git holds or would add that ESLint reads. */
const sources = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '*.ts', '*.tsx', '*.js', '*.mjs'],
    { cwd: root, encoding: 'utf8' }
)
    .split('\n')
    .filter((path) => path !== '');

/** A disable comment, line or block, and what follows the rules it names. */
const DISABLE = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b(.*)$/;

describe('the lint disable comments', () => {
    it('each say why, on the same line', () => {
        const unexplained = sources.flatMap((path) =>
            readFileSync(new URL(path, `file://${root}`), 'utf8')
                .split('\n')
                .flatMap((line, index) => {
                    const directive = DISABLE.exec(line)?.[1];
                    if (directive === undefined || /--\s*\S/.test(directive)) return [];
                    return [`${path}:${String(index + 1)}`];
                })
        );
        expect(unexplained).toEqual([]);
    });
});
