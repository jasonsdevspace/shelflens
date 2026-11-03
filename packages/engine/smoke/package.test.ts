import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import pkg from '../package.json' with { type: 'json' };
import * as engine from '../src/index.js';
import { VALUE_EXPORTS } from './exports.mjs';
import { floorOf } from './floor.mjs';

/**
 * The newest edition of the language each Node release runs in full, so the
 * engine is compiled against nothing its lowest supported Node lacks. A floor
 * missing from this table fails until its row is added from node.green.
 */
const EDITION_BY_MAJOR: Readonly<Record<number, number>> = { 20: 2023, 22: 2024, 24: 2025 };

/** The target and libraries the engine's build compiles against, as TypeScript resolves its config. */
const compiledAgainst = (): string[] => {
    const path = fileURLToPath(new URL('../tsconfig.build.json', import.meta.url));
    let unreadable = '';
    const parsed = ts.getParsedCommandLineOfConfigFile(
        path,
        {},
        {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
                unreadable = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            },
        }
    );
    if (parsed === undefined || parsed.errors.length > 0) {
        const errors = parsed?.errors.map((error) =>
            ts.flattenDiagnosticMessageText(error.messageText, '\n')
        );
        throw new Error(
            `the engine build config could not be read: ${unreadable || errors?.join(', ')}`
        );
    }
    const target = ts.ScriptTarget[parsed.options.target ?? ts.ScriptTarget.ESNext];
    // With no lib set, TypeScript compiles against the target's own default.
    return [target, ...(parsed.options.lib ?? [ts.getDefaultLibFileName(parsed.options)])];
};

/** What the README's section names as members of an export rather than as exports. */
const MEMBERS = ['search', 'recover', 'reconfigure', 'code'];

/** Every name the engine's entry exports, values and types, as the type checker sees them. */
const exported = (): string[] => {
    const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
    const program = ts.createProgram([entry], {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        noEmit: true,
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(entry);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) throw new Error('the engine entry could not be read');
    return checker
        .getExportsOfModule(module)
        .map((symbol) => symbol.name)
        .sort();
};

describe('the published engine', () => {
    it('lists every value it exports in the smoke test', () => {
        expect(Object.keys(engine).sort()).toEqual(VALUE_EXPORTS);
    });

    it('names in its README exactly what it exports, every value and every type', () => {
        const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
        const section = /## What it exports\n([\s\S]*?)\n## /.exec(readme)?.[1] ?? '';
        const named = new Set([...section.matchAll(/`(\w+)/g)].map((match) => match[1] ?? ''));
        for (const member of MEMBERS) named.delete(member);
        expect([...named].sort()).toEqual(exported());
    });

    it('names the lowest Node a range admits, down to the patch', () => {
        expect(floorOf('>=24')).toBe('24.0.0');
        expect(floorOf('>=22.12')).toBe('22.12.0');
        expect(floorOf('>= 22.12.1')).toBe('22.12.1');
        expect(floorOf('^24')).toBeUndefined();
        expect(floorOf('>=24 <25')).toBeUndefined();
    });

    it('declares a floor the smoke test can install', () => {
        expect(floorOf(pkg.engines.node)).toBeDefined();
    });

    it('compiles against no newer a language than its lowest supported Node runs', () => {
        const floor = Number(floorOf(pkg.engines.node)?.split('.')[0]);
        const edition = EDITION_BY_MAJOR[floor];
        expect(edition, `add Node ${floor} to the table`).toBeDefined();
        for (const name of compiledAgainst()) {
            const year = Number(/es(\d{4})/i.exec(name)?.[1] ?? Number.POSITIVE_INFINITY);
            expect(year, name).toBeLessThanOrEqual(edition ?? 0);
        }
    });
});
