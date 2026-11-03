/**
 * What a host said went wrong, read from an error's body, or nothing.
 *
 * Every path the page asks answers a failure in the API's error shape,
 * `{ errors: [{ message, extensions: { code } }] }`, so the rules and the
 * here, and a body that is not that shape, or not JSON at all, says nothing
 * rather than failing the read. Only a refusal gives a reason: a failure of
 * the host's own, a 500, says only that something went wrong on its side.
 */
export const reasonOf = async (response: Response): Promise<string | undefined> => {
    if (response.status >= 500) return undefined;
    try {
        const body = (await response.json()) as { errors?: { message?: unknown }[] } | null;
        const message = body?.errors?.[0]?.message;
        return typeof message === 'string' && message !== '' ? message : undefined;
    } catch {
        return undefined;
    }
};
