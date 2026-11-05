import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { SOURCE_CONDITION } from '../../../source-condition.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const main = fileURLToPath(new URL('./main.ts', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'shelflens-main-'));

afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
});

/** A rules file holding the given JSON, for `RULES` to name. */
const rulesFile = (name: string, json: unknown): string => {
    const path = join(scratch, name);
    writeFileSync(path, JSON.stringify(json));
    return path;
};

interface Run {
    readonly listened: boolean;
    readonly stderr: string;
}

/**
 * Runs the server from its source under the given settings, until it says it is listening,
 * when it is stopped, or until it exits on its own.
 */
const run = (settings: Record<string, string>): Promise<Run> =>
    new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            ['--import', 'tsx', `--conditions=${SOURCE_CONDITION}`, main],
            { cwd: root, env: { ...process.env, PORT: '0', PRODUCTS: '50', ...settings } }
        );
        let stdout = '';
        let stderr = '';
        let listened = false;
        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8');
            if (!listened && stdout.includes('listening on')) {
                listened = true;
                child.kill();
            }
        });
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf8');
        });
        child.on('error', reject);
        child.on('close', () => resolve({ listened, stderr }));
    });

describe('starting the server', () => {
    it('listens when the rules file and the origin settings are each what they claim', async () => {
        const started = await run({
            RULES: rulesFile('none.json', { rules: [] }),
            ORIGINS: 'https://a.example',
            ORIGIN_PATHS: 'graphql,events',
            OWN_ORIGIN: 'https://shop.example',
        });
        expect(started.stderr).toBe('');
        expect(started.listened).toBe(true);
    }, 30_000);

    it('stops before it listens when the rules file is not of the shape the demo ships', async () => {
        const started = await run({ RULES: rulesFile('misshapen.json', { rules: {} }) });
        expect(started.listened).toBe(false);
        expect(started.stderr).toContain('the rules file has no "rules" array');
    }, 30_000);

    it('stops before it listens when a rule names a product the catalog has not got', async () => {
        const started = await run({
            RULES: rulesFile('ghost.json', { rules: [{ id: 'ghost', pin: ['SL-99999'] }] }),
        });
        expect(started.listened).toBe(false);
        expect(started.stderr).toContain('rule ghost names a document that does not exist');
    }, 30_000);

    it('stops before it listens when an allowed origin is not an origin', async () => {
        const started = await run({ ORIGINS: 'https://a.example,file:///etc/hosts' });
        expect(started.listened).toBe(false);
        expect(started.stderr).toContain('ORIGINS holds something that is not an origin');
    }, 30_000);

    it('stops before it listens when the store’s own origin is not an origin', async () => {
        const started = await run({
            ORIGINS: 'https://a.example',
            OWN_ORIGIN: 'file:///etc/hosts',
        });
        expect(started.listened).toBe(false);
        expect(started.stderr).toContain(
            'OWN_ORIGIN holds something that is not an origin: file:///etc/hosts'
        );
    }, 30_000);

    it('stops before it listens when an origin path is not a path the store has', async () => {
        const started = await run({
            ORIGINS: 'https://a.example',
            ORIGIN_PATHS: 'graphql,catalog',
        });
        expect(started.listened).toBe(false);
        expect(started.stderr).toContain(
            'ORIGIN_PATHS holds a path the store has not got: catalog'
        );
    }, 30_000);
});
