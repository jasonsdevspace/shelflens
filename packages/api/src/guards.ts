/**
 * Checks the API's boundaries share, written once so they agree on what an
 * object is. A request's body, an event batch, a rules file and a visitor's
 * catalog are each checked as objects here, and a request and an event
 * batch are each read as JSON here.
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
