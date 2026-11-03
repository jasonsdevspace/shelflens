/**
 * The one shape an error takes on every transport, so a client reading the
 * API through the service worker, the Node server or the dev server reads
 * one kind of refusal. Each carries a code, as a GraphQL error does, under
 * `extensions`.
 */

/** One error as the API answers it. */
export interface StoreError {
    readonly message: string;
    readonly extensions?: Readonly<Record<string, unknown>>;
    readonly path?: readonly (string | number)[];
}

/** The codes of a client's own mistakes, whose messages reach the client as written. */
export const USER_CODES = ['BAD_USER_INPUT', 'QUERY_TOO_DEEP', 'QUERY_TOO_WIDE'] as const;
export type UserCode = (typeof USER_CODES)[number];

/** The code of a failure that is ours, whose message is replaced. */
export const INTERNAL_CODE = 'INTERNAL';

/** What a refusal at each status is, as the code its error carries. */
const STATUS_CODES: Readonly<Record<number, string>> = {
    400: 'BAD_REQUEST',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    429: 'TOO_MANY_REQUESTS',
    500: INTERNAL_CODE,
    503: 'NOT_READY',
};

/**
 * The body of an answer that refuses or fails, with the code its status
 * stands for unless `extensions` names a more exact one.
 */
export const errorBody = (
    status: number,
    message: string,
    extensions: Readonly<Record<string, unknown>> = {}
): { readonly errors: readonly StoreError[] } => ({
    errors: [{ message, extensions: { code: STATUS_CODES[status] ?? 'REFUSED', ...extensions } }],
});
