import { type RefObject, useEffect, useRef } from 'react';

/** Whether nothing holds focus, so the page may put it somewhere without taking it from the visitor. */
const focusIsFree = (): boolean => {
    const active = document.activeElement;
    return active === null || active === document.body;
};

const headingIn = (container: RefObject<HTMLElement | null>) =>
    container.current?.querySelector<HTMLElement>('.results-heading');

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
        if (focusIsFree()) {
            const links = container.current?.querySelectorAll<HTMLElement>('.card-link') ?? [];
            const card = [...links].find((link) => link.dataset.sku === sku);
            (card ?? headingIn(container))?.focus({ preventScroll: !card });
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
        if (focusIsFree()) headingIn(container)?.focus();
    }, [container, arrival, answered]);
};

/**
 * Puts focus back on the page when the control that had it went away, such
 * as a category's button replaced by its children, or "Clear all filters"
 * once nothing is ticked. Once the answer is in, focus goes to the open
 * drawer's title, or else to the results heading, so the next Tab starts
 * from there and a screen reader says where it is. Only a control that is
 * gone counts, so a browser that leaves focus on the page after a click,
 * as Safari does, never has it moved.
 */
export const useKeptFocus = (container: RefObject<HTMLElement | null>, answered: boolean): void => {
    const last = useRef<Element | null>(null);
    useEffect(() => {
        const seen = (event: FocusEvent) => {
            last.current = event.target instanceof Element ? event.target : null;
        };
        document.addEventListener('focusin', seen);
        return () => document.removeEventListener('focusin', seen);
    }, []);
    // After every render, since any change can take a control away.
    useEffect(() => {
        if (!answered || !focusIsFree() || last.current?.isConnected !== false) return;
        last.current = null;
        const drawer = document.querySelector<HTMLElement>(
            '.drawer-panel:not([hidden]) .drawer-title'
        );
        (drawer ?? headingIn(container))?.focus();
    });
};
