// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * The engine the other packages run is the one in this repository. The
 * tests resolve it to its sources, but a build resolves it through
 * node_modules, and a pin that the workspace's version does not satisfy
 * makes npm fetch the published engine from the registry instead. That
 * once shipped a worker without a feature the tests had passed. So the
 * pins follow the engine's version, and the lockfile holds no second copy.
 */

const root = new URL('../../../', import.meta.url);
const read = (path: string) =>
    JSON.parse(readFileSync(new URL(path, root), 'utf8')) as {
        version?: string;
        dependencies?: Record<string, string>;
        packages?: Record<string, { version?: string; resolved?: string }>;
    };

const ENGINE = '@jasonsdevspace/shelflens';

describe('the engine in the workspace', () => {
    const engine = read('packages/engine/package.json');

    it('is the version every package here pins', () => {
        for (const name of ['api', 'search']) {
            const pin = read(`packages/${name}/package.json`).dependencies?.[ENGINE];
            expect(pin, name).toBe(engine.version);
        }
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
