import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    clearRecentSearches,
    matchingRecent,
    RECENT_LIMIT,
    recentKeyFor,
    recentSearches,
    rememberSearch,
    useRecentSearches,
} from './recent.js';

beforeEach(() => {
    localStorage.clear();
    clearRecentSearches();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('recent searches', () => {
    it('keeps the newest first, each phrase once however it was capitalized', () => {
        rememberSearch('jacket');
        rememberSearch('boots');
        rememberSearch('Jacket');
        expect(recentSearches()).toEqual(['Jacket', 'boots']);
        expect(JSON.parse(localStorage.getItem('shelflens.recent') ?? '[]')).toEqual([
            'Jacket',
            'boots',
        ]);
    });

    it('keeps only so many, and nothing blank', () => {
        for (let i = 0; i < RECENT_LIMIT + 3; i += 1) rememberSearch(`phrase ${i}`);
        rememberSearch('   ');
        expect(recentSearches()).toHaveLength(RECENT_LIMIT);
        expect(recentSearches()[0]).toBe(`phrase ${RECENT_LIMIT + 2}`);
    });

    it('clears, and leaves nothing behind in storage', () => {
        rememberSearch('jacket');
        clearRecentSearches();
        expect(recentSearches()).toEqual([]);
        expect(localStorage.getItem('shelflens.recent')).toBeNull();
    });

    it('offers nothing when storage holds something else, or refuses', () => {
        localStorage.setItem('shelflens.recent', '{"not":"a list"}');
        clearRecentSearches();
        localStorage.setItem('shelflens.recent', '{"not":"a list"}');
        expect(recentSearches()).toEqual([]);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('refused');
        });
        expect(() => rememberSearch('jacket')).not.toThrow();
    });

    it('reaches a hook as it changes, here or in another tab', () => {
        const { result } = renderHook(() => useRecentSearches());
        expect(result.current).toEqual([]);
        act(() => rememberSearch('jacket'));
        expect(result.current).toEqual(['jacket']);
        act(() => {
            localStorage.setItem('shelflens.recent', JSON.stringify(['boots']));
            window.dispatchEvent(new StorageEvent('storage', { key: 'shelflens.recent' }));
        });
        expect(result.current).toEqual(['boots']);
    });

    it('shows a change made in another tab on the next read, with no event', () => {
        rememberSearch('jacket');
        localStorage.setItem('shelflens.recent', JSON.stringify(['boots']));
        expect(recentSearches()).toEqual(['boots']);
        const same = recentSearches();
        expect(recentSearches()).toBe(same);
    });

    it('matches what was typed at the start of a phrase or of any word in it', () => {
        const phrases = ['trail runner', 'Rain jacket', 'boots'];
        expect(matchingRecent(phrases, '')).toBe(phrases);
        expect(matchingRecent(phrases, 'r')).toEqual(['trail runner', 'Rain jacket']);
        expect(matchingRecent(phrases, 'JACK')).toEqual(['Rain jacket']);
        expect(matchingRecent(phrases, '  tra ')).toEqual(['trail runner']);
        expect(matchingRecent(['light trail runner'], 'trail r')).toEqual(['light trail runner']);
        expect(matchingRecent(['light trail runner'], 'ght tr')).toEqual([]);
        expect(matchingRecent(phrases, 'x')).toEqual([]);
    });

    it('takes only so many from storage, and nothing blank, whatever another tab wrote', () => {
        const many = ['', ...Array.from({ length: 40 }, (_, i) => `phrase ${i}`)];
        localStorage.setItem('shelflens.recent', JSON.stringify(many));
        expect(recentSearches()).toHaveLength(RECENT_LIMIT);
        expect(recentSearches()[0]).toBe('phrase 0');
        localStorage.setItem('shelflens.recent', JSON.stringify(['boots', 'Boots', 'jacket']));
        expect(recentSearches()).toEqual(['boots', 'jacket']);
    });
});

describe('where recent searches are kept', () => {
    it('keeps a visitor’s own store apart from the demo’s', () => {
        expect(recentKeyFor('/shelflens/', '/shelflens/')).toBe('shelflens.recent');
        expect(recentKeyFor('/shelflens/widget/', '/shelflens/')).toBe('shelflens.recent');
        expect(recentKeyFor('/shelflens/try/', '/shelflens/')).toBe('shelflens.try.recent');
        expect(recentKeyFor('/shelflens/try/widget/', '/shelflens/')).toBe('shelflens.try.recent');
    });
});
