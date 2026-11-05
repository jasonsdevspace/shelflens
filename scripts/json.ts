import { readFileSync } from 'node:fs';

import ts from 'typescript';

/*
 * Reading the repository's own JSON files, its manifests, the lockfile and the
 * tsconfigs, in a test. A file is read as unknown and looked up by the fields a
 * test checks. A lookup is lenient: a field that is missing or of another kind
 * reads as nothing, which the test's own assertion then fails on. The readers
 * for a store's answers, in the storefront's tests, fail at the lookup instead.
 */

/** A file's JSON, read as TypeScript reads a tsconfig, so comments of either kind are allowed. */
export const readJson = (path: string | URL): unknown => {
    const read = ts.parseConfigFileTextToJson(String(path), readFileSync(path, 'utf8'));
    if (read.error) {
        const message = ts.flattenDiagnosticMessageText(read.error.messageText, ' ');
        throw new Error(`${String(path)} is not JSON: ${message}`);
    }
    const parsed: unknown = read.config;
    return parsed;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a value holds at a path of its own fields, or nothing when a field is missing. */
export const lookup = (value: unknown, ...path: readonly string[]): unknown =>
    path.reduce<unknown>(
        (here, field) => (isRecord(here) && Object.hasOwn(here, field) ? here[field] : undefined),
        value
    );

/** The object at a path, or nothing when it is not one. */
export const lookupRecord = (
    value: unknown,
    ...path: readonly string[]
): Readonly<Record<string, unknown>> | undefined => {
    const found = lookup(value, ...path);
    return isRecord(found) ? found : undefined;
};

/** The text at a path, or nothing when it is not text. */
export const lookupText = (value: unknown, ...path: readonly string[]): string | undefined => {
    const found = lookup(value, ...path);
    return typeof found === 'string' ? found : undefined;
};
