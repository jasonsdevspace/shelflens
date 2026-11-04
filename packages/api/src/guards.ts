/**
 * Checks the API's boundaries share, written once so they agree on what an
 * object is. A request's body and its variables, an event batch, a rules file,
 * a visitor's catalog and the canonical form each check objects here, and a
 * request, its variables and an event batch are each read as JSON here.
 */

/** Whether a value is text. */
export const isString = (value: unknown): value is string => typeof value === 'string';

/** Whether a value is one of a known list, such as an event's kind or an error's code. */
export const isOneOf = <Known>(known: readonly Known[], value: unknown): value is Known =>
    known.some((entry) => entry === value);

/** Whether a value is a list, of anything. */
export const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

/** Whether a value is a list of text. */
export const isStrings = (value: unknown): value is readonly string[] =>
    isList(value) && value.every(isString);

/** Whether a value is a plain object, which an array is not. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** The value a text holds as JSON, or undefined when it holds none. */
export const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
};
