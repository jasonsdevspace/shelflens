import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_STATE } from './url.js';
import { useUrlState } from './useUrlState.js';

describe('the URL as state', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/');
    });

    it('pushes a history entry for a new page, and none for the page already shown', () => {
        const { result } = renderHook(() => useUrlState());
        const before = window.history.length;
        act(() => result.current[1]({ ...EMPTY_STATE, phrase: 'boot' }));
        expect(window.location.search).toBe('?q=boot');
        expect(result.current[0].phrase).toBe('boot');
        expect(window.history.length).toBe(before + 1);
        act(() => result.current[1]({ ...EMPTY_STATE, phrase: 'boot' }));
        expect(window.history.length).toBe(before + 1);
        act(() => result.current[1](EMPTY_STATE, { replace: true }));
        expect(window.location.search).toBe('');
        expect(window.history.length).toBe(before + 1);
    });
});
