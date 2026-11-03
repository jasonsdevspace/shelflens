import { type RefObject, useEffect, useRef } from 'react';

import { focusIsFree } from '../app/focus.js';

/** The results heading, by the id the page gave it, so a change of style cannot lose it. */
const headingOf = (id: string) => document.getElementById(id);

/**
 * Puts focus back where the visitor was when a product closes: on the card
 * for the product just closed, or on the results heading when that card is
 * no longer on the page. Runs once the request has settled, succeeds or
 * not, and steps aside if the visitor has already put focus somewhere, so
 * a facet ticked while the results were loading keeps it. Tells the caller
 * either way, so the request is not repeated on a later load.
 */
export const useReturnFocus = ({
    container,
    headingId,
    sku,
    settled,
    onDone,
}: {
    /** Where the cards are. */
    readonly container: RefObject<HTMLElement | null>;
    readonly headingId: string;
    /** The product just closed, or nothing when focus has been put back already. */
    readonly sku: string | undefined;
    readonly settled: boolean;
    readonly onDone: () => void;
}): void => {
    useEffect(() => {
        if (sku === undefined || !settled) return;
        if (focusIsFree()) {
            const links = container.current?.querySelectorAll<HTMLElement>('.card-link') ?? [];
            const card = [...links].find((link) => link.dataset['sku'] === sku);
            (card ?? headingOf(headingId))?.focus({ preventScroll: !card });
        }
        onDone();
    }, [container, headingId, sku, settled, onDone]);
};

/**
 * Moves focus to the results heading when the results land on a store the
 * visitor just asked for. Each arrival is a new number, so asking again for
 * the same store moves focus again. Steps aside if the visitor has already
 * put focus somewhere, as the return to a closed product does.
 */
export const useArrivalFocus = (
    headingId: string,
    arrival: number | undefined,
    answered: boolean
): void => {
    const handled = useRef<number>(undefined);
    useEffect(() => {
        if (arrival === undefined || !answered || handled.current === arrival) return;
        handled.current = arrival;
        if (focusIsFree()) headingOf(headingId)?.focus();
    }, [headingId, arrival, answered]);
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
export const useKeptFocus = (headingId: string, answered: boolean): void => {
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
        (drawer ?? headingOf(headingId))?.focus();
    });
};
