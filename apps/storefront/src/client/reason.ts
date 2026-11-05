import { isList, isRecord } from '@shelflens/api';

/**
 * What a host said went wrong, read from an error's body, or nothing.
 *
 * Every path the page asks answers a failure in the API's error shape,
 * `{ errors: [{ message, extensions: { code } }] }`, so the rules client and
 * the page for a visitor's catalog both read it here, and a body that is not
 * that shape, or not JSON at all, says nothing rather than failing the read.
 * Only a refusal gives a reason. A failure of the host's own, a status of 500
 * or above, says only that something went wrong on its side.
 */
export const reasonOf = async (response: Response): Promise<string | undefined> => {
    if (response.status >= 500) return undefined;
    try {
        const body: unknown = await response.json();
        const errors = isRecord(body) ? body['errors'] : undefined;
        const first = isList(errors) ? errors[0] : undefined;
        const message = isRecord(first) ? first['message'] : undefined;
        return typeof message === 'string' && message !== '' ? message : undefined;
    } catch {
        return undefined;
    }
};
