import { useEffect, useRef } from 'react';

import { StateLink } from '../app/StateLink.jsx';
import type { Navigate } from '../app/useUrlState.js';
import { STOPS } from './stops.js';

/**
 * The tour panel: one stop at a time, each with a link that puts the page
 * in the state that shows the gotcha, and the test behind it.
 *
 * It is a landmark beside the page, not a dialog over it, so a reviewer
 * can use the page while reading. The stop's text is a live region, so a
 * screen reader hears the next stop when it changes. Which stop is open
 * belongs to the app, so closing the panel and opening it again resumes
 * where it was. When the panel is opened on request, focus moves into it.
 */

export const TOUR_ID = 'tour';

export interface TourProps {
    readonly index: number;
    readonly onIndex: (index: number) => void;
    readonly navigate: Navigate;
    readonly onClose: () => void;
    /** Move focus into the panel as it appears. Not on a first visit, which the page owns. */
    readonly takeFocus: boolean;
}

/** The class on the page's root while the tour is open, and the property its height is kept in. */
const TOURING = 'is-touring';
const TOUR_HEIGHT = '--tour-height';

export const Tour = ({ index, onIndex, navigate, onClose, takeFocus }: TourProps) => {
    const closer = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (takeFocus) closer.current?.focus();
    }, [takeFocus]);
    // Marked on the page while the tour is open, with its height as it is drawn, so whatever
    // takes focus is scrolled into view above it, on a phone where it is a sheet across the
    // bottom and on a wide screen where it is a box in the corner.
    const sheet = useRef<HTMLElement>(null);
    useEffect(() => {
        const root = document.documentElement;
        root.classList.add(TOURING);
        const measure = () =>
            root.style.setProperty(
                TOUR_HEIGHT,
                `${String(sheet.current?.getBoundingClientRect().height ?? 0)}px`
            );
        measure();
        const watch =
            typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined;
        if (sheet.current) watch?.observe(sheet.current);
        return () => {
            watch?.disconnect();
            root.classList.remove(TOURING);
            root.style.removeProperty(TOUR_HEIGHT);
        };
    }, []);

    const stop = STOPS[index] ?? STOPS[0];
    if (!stop) return null;
    const last = index === STOPS.length - 1;
    return (
        <aside ref={sheet} id={TOUR_ID} className="tour" aria-label="Tour">
            <div className="tour-head">
                <p className="tour-count">
                    Stop {index + 1} of {STOPS.length}
                </p>
                <button ref={closer} type="button" className="button" onClick={onClose}>
                    Close
                </button>
            </div>
            <div aria-live="polite">
                <h2 className="tour-title">{stop.title}</h2>
                <p className="tour-body">{stop.body}</p>
                <p className="tour-test">
                    Tested in{' '}
                    {stop.tests.map((test, i) => (
                        <span key={test}>
                            {i > 0 && (i === stop.tests.length - 1 ? ' and ' : ', ')}
                            <code>{test}</code>
                        </span>
                    ))}
                </p>
            </div>
            <div className="tour-nav">
                {stop.to && (
                    <StateLink className="button tour-try" to={stop.to} navigate={navigate}>
                        Try it
                    </StateLink>
                )}
                <button
                    type="button"
                    className="button"
                    disabled={index === 0}
                    onClick={() => onIndex(index - 1)}
                >
                    Previous
                </button>
                <button
                    type="button"
                    className="button"
                    onClick={() => (last ? onClose() : onIndex(index + 1))}
                >
                    {last ? 'Finish' : 'Next'}
                </button>
            </div>
        </aside>
    );
};
