import { type RefObject, useEffect } from 'react';

/**
 * Puts focus back where the visitor was when a product closes: on the card
 * for the product just closed, or on the results heading when that card is
 * no longer on the page. Runs once the results have settled, and tells the
 * caller so the request is not repeated on the next render.
 */
export const useReturnFocus = (
    container: RefObject<HTMLElement | null>,
    sku: string | undefined,
    settled: boolean,
    onDone: () => void
): void => {
    useEffect(() => {
        if (sku === undefined || !settled) return;
        const root = container.current;
        const card = root?.querySelector<HTMLElement>(
            `.card-link[data-sku="${sku.replace(/"/g, '\\"')}"]`
        );
        const heading = root?.querySelector<HTMLElement>('.results-heading');
        (card ?? heading)?.focus({ preventScroll: card === null || card === undefined });
        onDone();
    }, [container, sku, settled, onDone]);
};
