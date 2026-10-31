import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as engine from '../src/index.js';
import { VALUE_EXPORTS } from './exports.mjs';
import { floorOf } from './floor.mjs';

const read = (path: string): unknown =>
    JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

/**
 * The newest edition of the language each Node release runs in full, so the
 * engine is compiled against nothing its lowest supported Node lacks. A floor
 * missing from this table fails until its row is added from node.green.
 */
const EDITION_BY_MAJOR: Readonly<Record<number, number>> = { 20: 2023, 22: 2024, 24: 2025 };

describe('the published engine', () => {
    it('lists every value it exports in the smoke test', () => {
        expect(Object.keys(engine).sort()).toEqual(VALUE_EXPORTS);
    });

    it('names the lowest Node a range admits, down to the patch', () => {
        expect(floorOf('>=24')).toBe('24.0.0');
        expect(floorOf('>=22.12')).toBe('22.12.0');
        expect(floorOf('>= 22.12.1')).toBe('22.12.1');
        expect(floorOf('^24')).toBeUndefined();
        expect(floorOf('>=24 <25')).toBeUndefined();
    });

    it('declares a floor the smoke test can install', () => {
        const pkg = read('../package.json') as { engines: { node: string } };
        expect(floorOf(pkg.engines.node)).toBeDefined();
    });

    it('compiles against no newer a language than its lowest supported Node runs', () => {
        const pkg = read('../package.json') as { engines: { node: string } };
        type Options = { compilerOptions: { target?: string; lib?: string[] } };
        const base = read('../../../tsconfig.base.json') as Options;
        const build = read('../tsconfig.build.json') as Options;
        const target = build.compilerOptions.target ?? base.compilerOptions.target ?? 'ESNext';
        const lib = build.compilerOptions.lib ?? base.compilerOptions.lib ?? ['ESNext'];
        const floor = Number(floorOf(pkg.engines.node)?.split('.')[0]);
        const edition = EDITION_BY_MAJOR[floor];
        expect(edition, `add Node ${floor} to the table`).toBeDefined();
        const years = [target, ...lib].map((name) =>
            Number(/^ES(\d{4})/i.exec(name)?.[1] ?? Number.POSITIVE_INFINITY)
        );
        for (const year of years) expect(year).toBeLessThanOrEqual(edition ?? 0);
    });
});
