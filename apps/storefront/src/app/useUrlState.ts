import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { parseSearchState, type SearchState, serializeSearchState } from './url.js';

/**
 * The URL as React state.
 *
 * Reading goes through the browser's location, so the back button and a
 * pasted link are the same thing as a click. Writing pushes a history
 * entry, so every filter is one step back, and announces the change the
 * way the browser would. Asking for the page already shown changes
 * nothing, so the back button never has to step through the same page.
 */

export type Navigate = (next: SearchState, options?: { readonly replace?: boolean }) => void;

const subscribe = (onChange: () => void) => {
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
};

const read = () => window.location.search;

export const useUrlState = (): readonly [SearchState, Navigate] => {
    const search = useSyncExternalStore(subscribe, read, () => '');
    const state = useMemo(() => parseSearchState(search), [search]);
    const navigate = useCallback<Navigate>((next, { replace = false } = {}) => {
        const search = serializeSearchState(next);
        if (search === window.location.search) return;
        const url = `${window.location.pathname}${search}`;
        if (replace) {
            window.history.replaceState(null, '', url);
        } else {
            window.history.pushState(null, '', url);
        }
        window.dispatchEvent(new PopStateEvent('popstate'));
    }, []);
    return [state, navigate];
};
