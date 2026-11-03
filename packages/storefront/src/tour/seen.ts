/**
 * Whether this browser has seen the tour, and the stop it was on, kept in
 * local storage so it opens itself once and a reload resumes it. Storage
 * can be missing or refused, in a private window or a test document, and
 * then the tour simply opens each time, at its first stop.
 */
const KEY = 'shelflens.tour';

export const hasSeenTour = (): boolean => {
    try {
        return localStorage.getItem(KEY) === 'seen';
    } catch {
        return false;
    }
};

export const markTourSeen = (): void => {
    try {
        localStorage.setItem(KEY, 'seen');
    } catch {
        // Nothing to do: the tour will open again next time.
    }
};

/** The stop the tour was last on, so a reload takes the visitor back to it. */
const STOP_KEY = 'shelflens.tour.stop';

/** The stop to open on: the one last shown, or the first when none was kept or it is no stop. */
export const keptTourStop = (stops: number): number => {
    try {
        const kept = Number(localStorage.getItem(STOP_KEY));
        return Number.isInteger(kept) && kept >= 0 && kept < stops ? kept : 0;
    } catch {
        return 0;
    }
};

export const keepTourStop = (index: number): void => {
    try {
        localStorage.setItem(STOP_KEY, String(index));
    } catch {
        // Nothing to do: a reload starts the tour at its first stop.
    }
};
