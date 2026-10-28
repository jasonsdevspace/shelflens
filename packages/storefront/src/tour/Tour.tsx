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

export const Tour = ({ index, onIndex, navigate, onClose, takeFocus }: TourProps) => {
    const closer = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (takeFocus) closer.current?.focus();
    }, [takeFocus]);

    const stop = STOPS[index] ?? STOPS[0];
    if (!stop) return null;
    const last = index === STOPS.length - 1;
    return (
        <aside id={TOUR_ID} className="tour" aria-label="Tour">
            <div className="tour-head">
                <p className="tour-count">
                    Stop {index + 1} of {STOPS.length}
                </p>
                <button ref={closer} type="button" className="tour-close" onClick={onClose}>
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
                            {i > 0 && ' and '}
                            <code>{test}</code>
                        </span>
                    ))}
                </p>
            </div>
            <div className="tour-nav">
                {stop.to && (
                    <StateLink className="tour-try" to={stop.to} navigate={navigate}>
                        Try it
                    </StateLink>
                )}
                <button
                    type="button"
                    className="tour-step"
                    disabled={index === 0}
                    onClick={() => onIndex(index - 1)}
                >
                    Previous
                </button>
                <button
                    type="button"
                    className="tour-step"
                    onClick={() => (last ? onClose() : onIndex(index + 1))}
                >
                    {last ? 'Finish' : 'Next'}
                </button>
            </div>
        </aside>
    );
};
