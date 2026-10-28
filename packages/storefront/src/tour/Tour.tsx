import { useState } from 'react';

import { StateLink } from '../app/StateLink.jsx';
import type { Navigate } from '../app/useUrlState.js';
import { STOPS } from './stops.js';

/**
 * The tour panel: one stop at a time, each with a link that puts the page
 * in the state that shows the gotcha, and the test behind it.
 *
 * It is a landmark beside the page, not a dialog over it, so a reviewer
 * can use the page while reading. The stop's text is a live region, so a
 * screen reader hears the next stop when it changes.
 */

export interface TourProps {
    readonly navigate: Navigate;
    readonly onClose: () => void;
}

export const Tour = ({ navigate, onClose }: TourProps) => {
    const [index, setIndex] = useState(0);
    const stop = STOPS[index] ?? STOPS[0];
    if (!stop) return null;
    const last = index === STOPS.length - 1;
    return (
        <aside className="tour" aria-label="Tour">
            <div className="tour-head">
                <p className="tour-count">
                    Stop {index + 1} of {STOPS.length}
                </p>
                <button type="button" className="tour-close" onClick={onClose}>
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
                <StateLink className="tour-try" to={stop.to} navigate={navigate}>
                    Try it
                </StateLink>
                <button
                    type="button"
                    className="tour-step"
                    disabled={index === 0}
                    onClick={() => setIndex(index - 1)}
                >
                    Previous
                </button>
                <button
                    type="button"
                    className="tour-step"
                    onClick={() => (last ? onClose() : setIndex(index + 1))}
                >
                    {last ? 'Finish' : 'Next'}
                </button>
            </div>
        </aside>
    );
};
