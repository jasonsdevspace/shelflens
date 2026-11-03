import { useRef, useState } from 'react';

import { NARROW, useMediaQuery } from '../app/useMediaQuery.js';
import { hasSeenTour, keepTourStop, keptTourStop, markTourSeen } from './seen.js';
import { STOPS } from './stops.js';

/**
 * Whether the tour is open, which stop it is on, and the way to open and
 * close it. A first visit opens it, or on a phone offers it.
 */
export const useTour = (offered: boolean) => {
    const [touring, setTouring] = useState(() => offered && !hasSeenTour());
    // The stop last shown, kept in the browser so a reload resumes it.
    const [tourStop, setStop] = useState(() => keptTourStop(STOPS.map((stop) => stop.id)));
    const setTourStop = (index: number) => {
        keepTourStop(STOPS[index]?.id ?? '');
        setStop(index);
    };
    // Whether the panel was asked for, as opposed to opening itself on a first visit.
    const [tourAsked, setTourAsked] = useState(false);
    // A phone's first visit offers the tour in a short bar, and opens the sheet only on Start.
    // Whether it is a phone is settled as the page opens, so turning it never swaps the two.
    const narrow = useMediaQuery(NARROW);
    const [onPhone] = useState(narrow);
    const offering = touring && !tourAsked && onPhone;
    // The Tour button opens and closes the sheet. While the bar only offers it, the sheet is closed.
    const sheetOpen = touring && !offering;
    const tourButton = useRef<HTMLButtonElement>(null);
    const openTour = () => {
        setTourAsked(true);
        setTouring(true);
    };
    const closeTour = () => {
        markTourSeen();
        setTouring(false);
        tourButton.current?.focus();
    };
    return {
        touring,
        offering,
        sheetOpen,
        tourStop,
        setTourStop,
        tourAsked,
        tourButton,
        openTour,
        closeTour,
    };
};
