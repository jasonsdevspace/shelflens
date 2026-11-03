import type { MouseEvent, ReactNode } from 'react';

import { type SearchState, serializeSearchState } from './url.js';
import type { Navigate } from './useUrlState.js';

/**
 * Whether a click on a link means "go here, in this tab". A modifier asks the
 * browser for something else: a new tab or window, or with Alt a download.
 */
export const isPlainClick = (event: MouseEvent) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export interface StateLinkProps {
    readonly to: SearchState;
    readonly navigate: Navigate;
    readonly className?: string | undefined;
    readonly current?: boolean | undefined;
    readonly children: ReactNode;
}

/**
 * A link to another page state.
 *
 * A real link, so it opens in a new tab and a crawler can follow it, that
 * navigates in place when clicked plainly, so the page changes without a
 * reload and the URL changes with it.
 */
export const StateLink = ({ to, navigate, className, current, children }: StateLinkProps) => (
    <a
        className={className}
        href={serializeSearchState(to) || '?'}
        aria-current={current ? 'page' : undefined}
        onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            navigate(to);
        }}
    >
        {children}
    </a>
);
