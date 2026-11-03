import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, kept current as the viewport changes.
 *
 * The layout decides most things in CSS. This is for the few places where
 * the markup itself has to differ, such as facets that are a sidebar on a
 * wide screen and a drawer on a phone. Without `matchMedia`, as in a test
 * document, nothing matches.
 */
export const useMediaQuery = (query: string): boolean => {
    const subscribe = useCallback(
        (onChange: () => void) => {
            if (typeof window.matchMedia !== 'function') return () => {};
            const list = window.matchMedia(query);
            list.addEventListener('change', onChange);
            return () => list.removeEventListener('change', onChange);
        },
        [query]
    );
    const read = useCallback(
        () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
        [query]
    );
    return useSyncExternalStore(subscribe, read, () => false);
};

/** The width below which the results page stacks and the facets become a drawer. */
export const NARROW = '(max-width: 48rem)';
