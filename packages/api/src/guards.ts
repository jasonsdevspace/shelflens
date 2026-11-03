/**
 * The checks every boundary of the API reads a value through: a request's
 * body, an event batch, a rules file and a visitor's catalog. Written once,
 * so the boundaries agree on what an object is and on what is not JSON.
 */

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
