import { Button } from '@jasonsdevspace/design-kit/react';
import { type KeyboardEvent, type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

import { REPO_URL } from '../app/Portfolio.jsx';
import { StateLink } from '../app/StateLink.jsx';
import type { SearchState } from '../app/url.js';
import type { Navigate } from '../app/useUrlState.js';
import { listSeparator } from '../format/list.js';
import { land } from './land.js';
import { STOPS } from './stops.js';

/**
 * The tour panel: one stop at a time, each with a link that puts the page
 * in the state that shows the gotcha, and the test behind it.
 *
 * It is a landmark beside the page, not a dialog over it, so a reviewer
 * can use the page while reading. The stop's position, title and text are
 * a live region, so a screen reader hears where it is and the next stop
 * when it changes, and the test files are left for reading. Which stop is
 * open belongs to the app, so closing the panel and opening it again
 * resumes where it was. When the panel is opened on request, focus moves
 * into it, and Escape inside it closes it.
 */

const TOUR_ID = 'tour';

/** The class on the page's root while the tour is open, and the property its height is kept in. */
const TOURING = 'is-touring';
const TOUR_HEIGHT = '--tour-height';

/**
 * Marks the page while the tour is open, with its height as it is drawn, so
 * whatever takes focus is scrolled into view above it, on a phone where it
 * is a sheet across the bottom and on a wide screen where it is a box in
 * the corner. The height kept is the tallest the tour has been since it
 * opened, so a shorter stop never takes room from under the page, which
 * would shift a page scrolled to its end each time the stop changed.
 */
const useRoomForTour = (sheet: RefObject<HTMLElement | null>) => {
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add(TOURING);
        let tallest = 0;
        const measure = () => {
            tallest = Math.max(tallest, sheet.current?.getBoundingClientRect().height ?? 0);
            root.style.setProperty(TOUR_HEIGHT, `${String(tallest)}px`);
        };
        measure();
        const watch =
            typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined;
        if (sheet.current) watch?.observe(sheet.current);
        return () => {
            watch?.disconnect();
            root.classList.remove(TOURING);
            root.style.removeProperty(TOUR_HEIGHT);
        };
    }, [sheet]);
};

/** A test's file, without the folders it is in. */
const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** Escape closes the tour from anywhere inside it, unless a control inside used the key. */
const closeOnEscape = (onClose: () => void) => (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
};

/**
 * What a phone shows on a first visit in place of the sheet: a short bar
 * across the bottom that says what the tour is, and opens it on Start.
 */
const TourOffer = ({
    onStart,
    onDecline,
}: {
    readonly onStart: () => void;
    readonly onDecline: () => void;
}) => {
    const bar = useRef<HTMLElement>(null);
    useRoomForTour(bar);
    return (
        <aside
            ref={bar}
            id={TOUR_ID}
            className="tour tour-offer"
            aria-label="Tour"
            onKeyDown={closeOnEscape(onDecline)}
        >
            <p className="tour-offer-text">A tour of what to try, {STOPS.length} stops</p>
            <div className="tour-offer-actions">
                <Button onClick={onStart}>Start</Button>
                <Button onClick={onDecline}>Not now</Button>
            </div>
        </aside>
    );
};

export interface TourProps {
    readonly index: number;
    readonly onIndex: (index: number) => void;
    readonly navigate: Navigate;
    readonly onClose: () => void;
    /** Move focus into the panel as it appears. Not on a first visit, which the page owns. */
    readonly takeFocus: boolean;
}

export const Tour = ({ index, onIndex, navigate, onClose, takeFocus }: TourProps) => {
    const closer = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (takeFocus) closer.current?.focus();
    }, [takeFocus]);
    const sheet = useRef<HTMLElement>(null);
    useRoomForTour(sheet);
    // On each change of stop: the landing "Try it" started is given up, and the
    // new stop opens at its top, with its count and Close in view, before it is
    // drawn. A keyboard visitor's focus stays in view, where the buttons scroll
    // with the stop on a short screen.
    const landing = useRef<() => void>(undefined);
    useEffect(() => () => landing.current?.(), [index]);
    useLayoutEffect(() => {
        const at = sheet.current;
        if (!at) return;
        at.scrollTop = 0;
        const focused = document.activeElement;
        if (
            focused instanceof HTMLElement &&
            at.contains(focused) &&
            focused.matches(':focus-visible')
        ) {
            focused.scrollIntoView({ block: 'nearest' });
        }
    }, [index]);

    const stop = STOPS[index] ?? STOPS[0];
    if (!stop) return null;
    const first = index === 0;
    const last = index === STOPS.length - 1;
    const position = `Stop ${String(index + 1)} of ${String(STOPS.length)}`;
    const tryIt = (to: SearchState) => {
        navigate(to);
        landing.current?.();
        landing.current = stop.focus === undefined ? undefined : land(to, stop.focus);
    };
    return (
        <aside
            ref={sheet}
            id={TOUR_ID}
            className="tour"
            aria-label="Tour"
            onKeyDown={closeOnEscape(onClose)}
        >
            <div className="tour-head">
                {/* Said with the stop below, so it is heard each time the stop changes. */}
                <p className="tour-count" aria-hidden="true">
                    {position}
                </p>
                <button
                    ref={closer}
                    type="button"
                    className="dk-button tour-close"
                    onClick={onClose}
                >
                    Close
                </button>
            </div>
            <div className="tour-progress" aria-hidden="true">
                <span
                    className="tour-progress-done"
                    style={{ inlineSize: `${String(((index + 1) / STOPS.length) * 100)}%` }}
                />
            </div>
            <div aria-live="polite">
                <p className="visually-hidden">{position}</p>
                <h2 className="tour-title">{stop.title}</h2>
                <p className="tour-body">{stop.body}</p>
            </div>
            <p className="tour-test">
                Tested in{' '}
                {stop.tests.map((test, i) => (
                    <span key={test}>
                        {listSeparator(i, stop.tests.length)}
                        {/*
                         * Named by its file, and a link to it in the repository, so the
                         * folder it is in is a press away on a phone and from the keyboard.
                         */}
                        <a
                            className="tour-test-file"
                            href={`${REPO_URL}/blob/main/${test}`}
                            title={test}
                        >
                            <code>{fileName(test)}</code>
                        </a>
                    </span>
                ))}
            </p>
            <div className="tour-nav">
                {stop.to && (
                    <StateLink className="dk-button dk-button-accent" to={stop.to} navigate={tryIt}>
                        Try it
                    </StateLink>
                )}
                <div className="tour-steps">
                    {/* Off at the first stop, but still focusable, so pressing it there leaves focus on it. */}
                    <Button
                        off={first}
                        onClick={() => {
                            if (!first) onIndex(index - 1);
                        }}
                    >
                        Previous
                    </Button>
                    <Button
                        onClick={() => {
                            if (!last) {
                                onIndex(index + 1);
                                return;
                            }
                            // A finished tour opens on its first stop next time.
                            onIndex(0);
                            onClose();
                        }}
                    >
                        {/* Both words in one place, the other hidden, so the button is as wide on every stop. */}
                        <span className="tour-step-label">
                            <span
                                className={last ? 'tour-step-unused' : undefined}
                                aria-hidden={last}
                            >
                                Next
                            </span>
                            <span
                                className={last ? undefined : 'tour-step-unused'}
                                aria-hidden={!last}
                            >
                                Finish
                            </span>
                        </span>
                    </Button>
                </div>
            </div>
        </aside>
    );
};

/** Opens and closes the tour, and says which panel it controls. */
export const TourToggle = ({
    touring,
    onToggle,
    buttonRef,
}: {
    readonly touring: boolean;
    readonly onToggle: () => void;
    readonly buttonRef: RefObject<HTMLButtonElement | null>;
}) => (
    <button
        ref={buttonRef}
        type="button"
        className="dk-button"
        aria-expanded={touring}
        // Names the tour only while there is one to name.
        aria-controls={touring ? TOUR_ID : undefined}
        onClick={onToggle}
    >
        Tour
    </button>
);

/** The tour, or on a phone's first visit the short bar that offers it. */
export const TourPlace = ({
    offering,
    onStart,
    ...tour
}: TourProps & { readonly offering: boolean; readonly onStart: () => void }) =>
    offering ? <TourOffer onStart={onStart} onDecline={tour.onClose} /> : <Tour {...tour} />;
