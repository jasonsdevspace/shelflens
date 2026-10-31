import { type RefObject, useEffect, useRef } from 'react';

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

/**
 * Moves focus to the results heading when the results land on a store the
 * visitor just asked for. Each arrival is a new number, so asking again for
 * the same store moves focus again. Steps aside if the visitor has already
 * put focus somewhere, as the return to a closed product does.
 */
export const useArrivalFocus = (
    container: RefObject<HTMLElement | null>,
    arrival: number | undefined,
    answered: boolean
): void => {
    const handled = useRef<number>(undefined);
    useEffect(() => {
        if (arrival === undefined || !answered || handled.current === arrival) return;
        handled.current = arrival;
        const active = document.activeElement;
        if (active !== null && active !== document.body) return;
        container.current?.querySelector<HTMLElement>('.results-heading')?.focus();
    }, [container, arrival, answered]);
};
