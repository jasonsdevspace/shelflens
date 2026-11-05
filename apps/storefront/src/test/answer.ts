import { isList, isRecord } from '@shelflens/api';

/*
 * Reading a JSON answer in a test. Each reader walks a path and checks each step, so a test
 * that meets an answer of another shape fails naming the path and showing the whole answer,
 * any GraphQL errors included, rather than with a TypeError from reading a property of
 * undefined.
 */

type Step = string | number;

const fail = (answer: unknown, path: readonly Step[], expected: string): never => {
    throw new Error(`expected ${expected} at ${path.join('.')} in ${JSON.stringify(answer)}`);
};

/**
 * What an answer holds at a path, null included. A step the answer does not hold fails the
 * test, naming the path up to that step.
 */
export const at = (answer: unknown, ...path: readonly Step[]): unknown => {
    let value = answer;
    for (const [index, step] of path.entries()) {
        // A number steps only to an index a list holds, and text only to a field a record
        // holds itself, so no step lands on a list's length or on what a record inherits, such
        // as its constructor.
        const here = value;
        if (
            typeof step === 'number' &&
            isList(here) &&
            Number.isInteger(step) &&
            step >= 0 &&
            step < here.length
        ) {
            value = here[step];
        } else if (typeof step === 'string' && isRecord(here) && Object.hasOwn(here, step)) {
            value = here[step];
        } else {
            return fail(answer, path.slice(0, index + 1), 'a value');
        }
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
