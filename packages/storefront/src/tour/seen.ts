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

/**
 * The stop the tour was last on, so a reload takes the visitor back to it.
 * Kept by its id, so a tour with stops added or moved since still resumes
 * on the same one.
 */
const STOP_KEY = 'shelflens.tour.stop';

/** Where among `ids` to open: the stop last shown, or the first when none was kept or it is gone. */
export const keptTourStop = (ids: readonly string[]): number => {
    try {
        return Math.max(0, ids.indexOf(localStorage.getItem(STOP_KEY) ?? ''));
    } catch {
        return 0;
    }
};

export const keepTourStop = (id: string): void => {
    try {
        localStorage.setItem(STOP_KEY, id);
    } catch {
        // Nothing to do: a reload starts the tour at its first stop.
    }
};
