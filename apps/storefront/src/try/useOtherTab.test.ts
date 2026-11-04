import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Loaded } from '../client/catalog.js';
import { useOtherTab } from './useOtherTab.js';

let answer: (loaded: Loaded | undefined) => void = (_loaded) => undefined;
const readLoaded = vi.fn(
    () =>
        new Promise<Loaded | undefined>((resolve) => {
            answer = resolve;
        })
);

vi.mock('../client/catalog.js', () => ({ readLoaded: () => readLoaded() }));

describe('the check for a change another tab made', () => {
    it('says what it read though the page drew again while it read', async () => {
        const said: (Loaded | undefined)[] = [];
        const pending = { current: false };
        const { rerender } = renderHook(
            (_props: { drawn: number }) =>
                useOtherTab({
                    searching: 'v1',
                    catalogUrl: 'http://store.test/catalog',
                    pending,
                    // A new callback on every draw, as one written in place would be.
                    onChange: (loaded) => said.push(loaded),
                }),
            { initialProps: { drawn: 0 } }
        );
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        await waitFor(() => expect(readLoaded).toHaveBeenCalledOnce());
        rerender({ drawn: 1 });
        await act(async () => {
            answer(undefined);
            await Promise.resolve();
        });
        expect(said).toEqual([undefined]);
    });
});
