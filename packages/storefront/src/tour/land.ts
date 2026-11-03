import { parseSearchState, type SearchState, serializeSearchState } from '../app/url.js';

/*
 * Where "Try it" leaves the visitor. Once the page shows the stop's state
 * and has stopped loading, focus goes to what the stop points at, scrolled
 * into view above the tour, so a keyboard or screen reader user starts
 * where the stop's words are about. What the stop points at can be out of
 * sight, as the filters are in a closed drawer on a phone, and then the
 * page's heading takes focus instead.
 */

/** The page's own heading, for a stop whose target is not on the page or not in sight. */
const HEADING = 'h1';

/** How long the page may take to settle before the tour stops waiting for it. */
const BUDGET_MS = 5000;

/** Frames in a row the page must be settled, so a heading from the page before is not taken. */
const STEADY_FRAMES = 2;

const shown = (element: Element): boolean =>
    element.closest('[hidden], [inert]') === null &&
    (typeof element.checkVisibility !== 'function' || element.checkVisibility());

const firstShown = (selectors: readonly string[]): HTMLElement | undefined => {
    for (const selector of selectors) {
        const found = [...document.querySelectorAll<HTMLElement>(selector)].find(shown);
        if (found) return found;
    }
    return undefined;
};

const settled = (to: SearchState): boolean =>
    serializeSearchState(parseSearchState(window.location.search)) === serializeSearchState(to) &&
    document.querySelector('[aria-busy="true"]') === null;

const focusOn = (target: HTMLElement): void => {
    // A heading, a notice or a group takes focus from script without joining the Tab order.
    if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    // The page keeps room for the tour in its scroll padding, so nearest is above it.
    target.scrollIntoView({ block: 'nearest' });
};

/**
 * Waits for the page to show `to` and settle, then focuses the first shown
 * element `target` names, or the heading. Returns a function that stops
 * waiting, for a stop left before its page arrived.
 */
export const land = (to: SearchState, target: string): (() => void) => {
    const start = performance.now();
    let steady = 0;
    let frame = 0;
    const tick = () => {
        if (performance.now() - start > BUDGET_MS) return;
        steady = settled(to) ? steady + 1 : 0;
        const found = steady >= STEADY_FRAMES ? firstShown([target, HEADING]) : undefined;
        if (found) {
            focusOn(found);
            return;
        }
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
};
