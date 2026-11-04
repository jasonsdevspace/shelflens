import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createClient } from '../client/graphql.js';
import { StoreDocument } from '../generated/operations.js';
import { useQuery } from './useQuery.js';

/*
 * The hook keeps the previous answer on screen while the next is on its
 * way, and says so, whether the variables changed or the viewer did.
 */

// A real client over a fetch the test answers, so the hook meets the client it runs with.
const clientAnswering = (name: string) => {
    let release: () => void = () => undefined;
    const client = createClient({
        url: 'http://store.test/graphql',
        fetch: () =>
            new Promise<Response>((resolve) => {
                release = () => resolve(Response.json({ data: { store: { name } } }));
            }),
    });
    const answer = async () => {
        await act(async () => {
            release();
            await Promise.resolve();
        });
    };
    return { client, answer };
};

describe('useQuery', () => {
    it('reports loading, and keeps the last answer, when the client changes', async () => {
        const guest = clientAnswering('for a guest');
        const member = clientAnswering('for a member');
        const { result, rerender } = renderHook(
            ({ client }) => useQuery(client, StoreDocument, {}),
            { initialProps: { client: guest.client } }
        );
        expect(result.current.loading).toBe(true);
        await guest.answer();
        expect(result.current).toMatchObject({
            loading: false,
            data: { store: { name: 'for a guest' } },
        });

        rerender({ client: member.client });
        expect(result.current).toMatchObject({
            loading: true,
            data: { store: { name: 'for a guest' } },
        });
        await member.answer();
        expect(result.current).toMatchObject({
            loading: false,
            data: { store: { name: 'for a member' } },
        });
    });

    it('abandons the request in flight when its component goes', () => {
        let sent: AbortSignal | undefined;
        const client = createClient({
            url: 'http://store.test/graphql',
            fetch: (_input, init) => {
                sent = init?.signal ?? undefined;
                return new Promise<Response>(() => undefined);
            },
        });
        const { unmount } = renderHook(() => useQuery(client, StoreDocument, {}));
        expect(sent?.aborted).toBe(false);
        unmount();
        expect(sent?.aborted).toBe(true);
    });
});
