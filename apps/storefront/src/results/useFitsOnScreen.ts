import { useEffect, useState } from 'react';

/**
 * Whether an element fits on the screen with room above and below it, measured again as the
 * window or the element changes size, as when a list is shown in full. Before it is measured, and
 * where the browser cannot watch an element's size, it does not fit, so a column scrolls with the
 * page rather than staying in view with its foot out of reach.
 */
export const useFitsOnScreen = (element: HTMLElement | null, room: string): boolean => {
    const [fits, setFits] = useState(false);
    useEffect(() => {
        if (!element || typeof ResizeObserver === 'undefined') return;
        const measure = () => {
            const margin = parseFloat(getComputedStyle(element).getPropertyValue(room)) || 0;
            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            setFits(element.offsetHeight + 2 * margin * rem <= window.innerHeight);
        };
        const watcher = new ResizeObserver(measure);
        watcher.observe(element);
        window.addEventListener('resize', measure);
        measure();
        return () => {
            watcher.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [element, room]);
    return fits;
};
