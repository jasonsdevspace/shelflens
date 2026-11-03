import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * The release script, run against a stand-in for gh that keeps what it was
 * asked to create: the title it was given, and the notes, which are the
 * version's changelog entry with any lead paragraph above it.
 */

const SCRIPT = join(import.meta.dirname, 'github-release.sh');

const CHANGELOG = `# Changelog

## 0.6.0

- **Faster.** It is faster.

## 0.5.0

- **Older.** Not this one.
`;

/** Runs the script in a folder of its own, and reads back what the stand-in gh was asked for. */
const release = (lead?: string) => {
    const at = mkdtempSync(join(tmpdir(), 'github-release-'));
    try {
        writeFileSync(join(at, 'CHANGELOG.md'), CHANGELOG);
        // "release view" finds nothing, and "release create" keeps its arguments and its notes.
        const gh = join(at, 'gh');
        writeFileSync(
            gh,
            `#!/usr/bin/env bash
if [ "$2" = "view" ]; then exit 1; fi
printf '%s\\n' "$@" > "${at}/args"
while [ $# -gt 0 ]; do
    if [ "$1" = "--notes-file" ]; then cp "$2" "${at}/notes"; fi
    shift
done
`
        );
        chmodSync(gh, 0o755);
        // The lead is only the one this call gives, never one the shell running the tests has set.
        const { NOTES_LEAD: _outside, ...env } = process.env;
        execFileSync(
            'bash',
            [SCRIPT, 'engine-v0.6.0', '0.6.0', 'CHANGELOG.md', 'ShelfLens engine 0.6.0'],
            {
                cwd: at,
                env: {
                    ...env,
                    PATH: `${at}:${env['PATH'] ?? ''}`,
                    ...(lead === undefined ? {} : { NOTES_LEAD: lead }),
                },
            }
        );
        return {
            args: readFileSync(join(at, 'args'), 'utf8').split('\n'),
            notes: readFileSync(join(at, 'notes'), 'utf8'),
        };
    } finally {
        rmSync(at, { recursive: true, force: true });
    }
};

describe('the release on GitHub', () => {
    it('takes the title it is given, and the version entry alone as its notes', () => {
        const { args, notes } = release();
        expect(args.slice(0, 5)).toEqual([
            'release',
            'create',
            'engine-v0.6.0',
            '--title',
            'ShelfLens engine 0.6.0',
        ]);
        // The blank line before the next version's heading comes along, as it always has.
        expect(notes).toBe('- **Faster.** It is faster.\n\n');
    });

    it('puts a lead paragraph above the entry when it is given one', () => {
        const { notes } = release('Install with `npm install x@0.6.0`.');
        expect(notes).toBe(
            'Install with `npm install x@0.6.0`.\n\n- **Faster.** It is faster.\n\n'
        );
    });
});
