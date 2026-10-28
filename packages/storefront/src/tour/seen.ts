/**
 * Whether this browser has seen the tour, kept in local storage so it
 * opens itself once. Storage can be missing or refused, in a private
 * window or a test document, and then the tour simply opens each time.
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
