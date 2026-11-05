import { readFileSync } from 'node:fs';

/*
 * Reading the repository's own JSON files, its manifests, the lockfile and the
 * tsconfigs, in a test. A file is read as unknown and walked by the fields a
 * test checks, so a field that is missing or of another kind reads as nothing,
 * which the test's own assertion then fails on.
 */

/** A file's JSON, with any whole-line comments left out, as a tsconfig may hold them. */
export const readJson = (path: string | URL): unknown => {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    return parsed;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a value holds at a path of fields, or nothing when a field is missing. */
export const at = (value: unknown, ...path: readonly string[]): unknown =>
    path.reduce<unknown>((here, field) => (isRecord(here) ? here[field] : undefined), value);

/** The object at a path, or nothing when it is not one. */
export const recordAt = (
    value: unknown,
    ...path: readonly string[]
): Readonly<Record<string, unknown>> | undefined => {
    const found = at(value, ...path);
    return isRecord(found) ? found : undefined;
};

/** The text at a path, or nothing when it is not text. */
export const textAt = (value: unknown, ...path: readonly string[]): string | undefined => {
    const found = at(value, ...path);
    return typeof found === 'string' ? found : undefined;
};
