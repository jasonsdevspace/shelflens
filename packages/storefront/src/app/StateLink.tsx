import type { ReactNode } from 'react';

import { type SearchState, serializeSearchState } from './url.js';
import type { Navigate } from './useUrlState.js';

/**
 * A link to another page state.
 *
 * A real link, so it opens in a new tab and a crawler can follow it, that
 * navigates in place when clicked plainly, so the page changes without a
 * reload and the URL changes with it.
 */
export interface StateLinkProps {
    readonly to: SearchState;
    readonly navigate: Navigate;
    readonly className?: string | undefined;
    readonly current?: boolean | undefined;
    readonly children: ReactNode;
}

export const StateLink = ({ to, navigate, className, current, children }: StateLinkProps) => (
    <a
        className={className}
        href={serializeSearchState(to) || '?'}
        aria-current={current ? 'page' : undefined}
        onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            navigate(to);
        }}
    >
        {children}
    </a>
);
