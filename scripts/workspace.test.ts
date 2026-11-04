// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
const read = (path: string) =>
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a manifest or the lockfile, read for the fields this test checks
    JSON.parse(readFileSync(new URL(path, root), 'utf8')) as {
        version?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        packages?: Record<string, { version?: string; resolved?: string }>;
        workspaces?: string[];
    };

const ENGINE = '@jasonsdevspace/shelflens';

describe('the engine in the workspace', () => {
    const engine = read('packages/engine/package.json');

    it('is taken at any version by every package here that takes it, so the workspace is the one linked', () => {
        // Every workspace package, by its path, in the folders the root's manifest names.
        const takers = workspacePackages(fileURLToPath(root))
            .map((path) => [path, read(`${path}/package.json`)] as const)
            .flatMap(([name, manifest]) =>
                [manifest.dependencies, manifest.devDependencies].flatMap((listed) =>
                    listed?.[ENGINE] === undefined ? [] : [[name, listed[ENGINE]] as const]
                )
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
        const copies = Object.entries(lock.packages ?? {}).filter(([path]) =>
            path.endsWith(`node_modules/${ENGINE}`)
        );
        expect(copies.map(([path]) => path)).toEqual([`node_modules/${ENGINE}`]);
        expect(lock.packages?.['packages/engine']?.version).toBe(engine.version);
    });
});
