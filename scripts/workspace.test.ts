// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { lookup, lookupRecord, lookupText, readJson } from './json.js';
import { workspacePackages } from './repository.mjs';

/*
 * The engine the other packages run is the one in this repository. The
 * tests resolve it to its sources, but a build resolves it through
 * node_modules, and a pin that the workspace's version does not satisfy
 * makes npm fetch the published engine from the registry instead. That
 * once shipped a worker without a feature the tests had passed. So every
 * package takes the engine at any version, which the workspace always
 * satisfies, and the lockfile holds no second copy.
 */

const root = new URL('../', import.meta.url);
const read = (path: string) => readJson(new URL(path, root));

const ENGINE = '@jasonsdevspace/shelflens';

describe('the engine in the workspace', () => {
    const engine = read('packages/engine/package.json');

    it('is taken at any version by every package here that takes it, so the workspace is the one linked', () => {
        // Every workspace package, by its path, in the folders the root's manifest names.
        const takers = workspacePackages(fileURLToPath(root))
            .map((path) => [path, read(`${path}/package.json`)] as const)
            .flatMap(([name, manifest]) =>
                ['dependencies', 'devDependencies'].flatMap((listed) => {
                    const pin = lookup(manifest, listed, ENGINE);
                    return pin === undefined ? [] : [[name, pin] as const];
                })
            );
        // The packages known to take it, so a test that finds none fails rather than passing.
        expect(takers.map(([path]) => path)).toEqual(
            expect.arrayContaining(['packages/api', 'packages/search', 'apps/storefront'])
        );
        // Any version, so an engine release changes no other manifest, only the lockfile
        // npm writes from them.
        for (const [path, pin] of takers) expect(pin, path).toBe('*');
    });

    it('is the only copy the lockfile knows', () => {
        const lock = read('package-lock.json');
        const copies = Object.entries(lookupRecord(lock, 'packages') ?? {}).filter(([path]) =>
            path.endsWith(`node_modules/${ENGINE}`)
        );
        expect(copies.map(([path]) => path)).toEqual([`node_modules/${ENGINE}`]);
        // A version on each side, so the two cannot agree by both being missing.
        const version = lookupText(engine, 'version');
        expect(version).toMatch(/^\d+\.\d+\.\d+/);
        expect(lookupText(lock, 'packages', 'packages/engine', 'version')).toBe(version);
    });
});
