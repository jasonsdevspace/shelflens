import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** The room an element keeps above it on the screen: its scroll margin, in pixels. */
const roomAbove = (element: HTMLElement) =>
    parseFloat(getComputedStyle(element).scrollMarginTop) || 0;

/**
 * Whether an element fits on the screen with its scroll margin above it and as much below,
 * measured again, once a frame at most, as the window or the element changes size, as when a
 * list is shown in full. Before it is measured, and where the browser cannot watch an element's
 * size, it does not fit, so a column scrolls with the page rather than staying in view with its
 * foot out of reach.
 *
 * When an element that fit stops fitting, the page scrolls by as much as letting it go moves it,
 * so the element, and whatever the visitor just pressed in it, stays where it was on the screen.
 */
export const useFitsOnScreen = (element: HTMLElement | null): boolean => {
    const [fits, setFits] = useState(false);
    // Whether it fit when last drawn, so the moment it stops fitting is known.
    const fitted = useRef(false);
    useEffect(() => {
        if (!element || typeof ResizeObserver === 'undefined') return;
        let frame = 0;
        const measure = () => {
            frame = 0;
            setFits(element.offsetHeight + 2 * roomAbove(element) <= window.innerHeight);
        };
        const soon = () => {
            if (frame === 0) frame = requestAnimationFrame(measure);
        };
        const watcher = new ResizeObserver(soon);
        watcher.observe(element);
        window.addEventListener('resize', soon);
        measure();
        return () => {
            cancelAnimationFrame(frame);
            watcher.disconnect();
            window.removeEventListener('resize', soon);
        };
    }, [element]);
    useLayoutEffect(() => {
        if (element && fitted.current && !fits) {
            // Let go, it is back in its place on the page. While it stayed in view it was drawn at
            // that place or at its room from the top, whichever is further down, so scroll it back.
            const now = element.getBoundingClientRect().top;
            window.scrollBy(0, now - Math.max(now, roomAbove(element)));
        }
        fitted.current = fits;
    }, [element, fits]);
    return fits;
};
