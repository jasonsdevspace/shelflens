import { type RefObject, useEffect } from 'react';

/**
 * Puts focus back where the visitor was when a product closes: on the card
 * for the product just closed, or on the results heading when that card is
 * no longer on the page. Runs once the request has settled, succeeds or
 * not, and steps aside if the visitor has already put focus somewhere, so
 * a facet ticked while the results were loading keeps it. Tells the caller
 * either way, so the request is not repeated on a later load.
 */
export const useReturnFocus = (
    container: RefObject<HTMLElement | null>,
    sku: string | undefined,
    settled: boolean,
    onDone: () => void
): void => {
    useEffect(() => {
        if (sku === undefined || !settled) return;
        const active = document.activeElement;
        const taken = active !== null && active !== document.body;
        if (!taken) {
            const root = container.current;
            const links = root?.querySelectorAll<HTMLElement>('.card-link') ?? [];
            const card = [...links].find((link) => link.dataset.sku === sku);
            const heading = root?.querySelector<HTMLElement>('.results-heading');
            (card ?? heading)?.focus({ preventScroll: !card });
        }
        onDone();
    }, [container, sku, settled, onDone]);
};
