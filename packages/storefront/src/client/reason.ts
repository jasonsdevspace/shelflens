/**
 * What a host said went wrong, read from an error's body, or nothing.
 *
 * Every path the page asks answers a failure in the API's error shape,
 * `{ errors: [{ message }] }`, so the rules and the catalog clients read it
 * here, and a body that is not that shape, or not JSON
 * at all, says nothing rather than failing the read.
 */
export const reasonOf = async (response: Response): Promise<string | undefined> => {
    try {
        const body = (await response.json()) as { errors?: { message?: unknown }[] } | null;
        const message = body?.errors?.[0]?.message;
        return typeof message === 'string' && message !== '' ? message : undefined;
    } catch {
        return undefined;
    }
};
