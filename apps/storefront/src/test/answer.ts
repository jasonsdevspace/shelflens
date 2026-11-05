import { isList, isRecord } from '@shelflens/api';

/*
 * Reading a JSON answer in a test. Each reader walks a path and checks each
 * step, so a test that meets an answer of another shape fails naming the path
 * and showing the whole answer, a GraphQL error among it, rather than reading
 * a property of nothing.
 */

type Step = string | number;

const fail = (answer: unknown, path: readonly Step[], expected: string): never => {
    throw new Error(`expected ${expected} at ${path.join('.')} in ${JSON.stringify(answer)}`);
};

/** What an answer holds at a path, null included. */
export const at = (answer: unknown, ...path: readonly Step[]): unknown => {
    let value = answer;
    for (const [index, step] of path.entries()) {
        const here = isList(value) ? value : isRecord(value) ? value : undefined;
        if (here === undefined || !(step in here)) {
            return fail(answer, path.slice(0, index + 1), 'a value');
        }
        value = isList(here) ? here[Number(step)] : here[step];
    }
    return value;
};

/** The list at a path. */
export const listAt = (answer: unknown, ...path: readonly Step[]): readonly unknown[] => {
    const value = at(answer, ...path);
    return isList(value) ? value : fail(answer, path, 'a list');
};

/** The text at a path. */
export const textAt = (answer: unknown, ...path: readonly Step[]): string => {
    const value = at(answer, ...path);
    return typeof value === 'string' ? value : fail(answer, path, 'text');
};

/** The number at a path. */
export const numberAt = (answer: unknown, ...path: readonly Step[]): number => {
    const value = at(answer, ...path);
    return typeof value === 'number' ? value : fail(answer, path, 'a number');
};
