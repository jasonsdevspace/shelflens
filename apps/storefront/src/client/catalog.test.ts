import { afterEach, describe, expect, it, vi } from 'vitest';

import { readLoaded } from './catalog.js';

/** Answers every request with this body and status, as the worker's catalog path would. */
const answering = (body: unknown, status = 200) =>
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(Response.json(body, { status })))
    );

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('reading what the worker has loaded', () => {
    it('reads the version and the product count it answers with', async () => {
        answering({ version: 'v1', products: 12 });
        await expect(readLoaded('/catalog')).resolves.toEqual({ version: 'v1', products: 12 });
    });

    it('reads nothing loaded as nothing', async () => {
        answering({}, 404);
        await expect(readLoaded('/catalog')).resolves.toBeUndefined();
    });

    it('refuses an answer in another shape, as a worker from another deploy might give', async () => {
        answering({ version: 'v1', count: 12 });
        await expect(readLoaded('/catalog')).rejects.toThrow('a shape this page does not read');
        answering(null);
        await expect(readLoaded('/catalog')).rejects.toThrow('a shape this page does not read');
    });
});
