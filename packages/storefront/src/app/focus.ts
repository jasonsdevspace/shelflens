import { useLayoutEffect, useRef } from 'react';

/*
 * Where focus goes when the page, rather than the visitor, moves it. Every
 * page moves it the same two ways: onto what replaced the control the
 * visitor used, in the same commit as the change, and never away from where
 * the visitor has already put it.
 */

/** Whether nothing holds focus, so the page may put it somewhere without taking it from the visitor. */
export const focusIsFree = (): boolean => {
    const active = document.activeElement;
    return active === null || active === document.body;
};

/**
 * Moves focus to a heading when it appears because of something the visitor
 * did, so a keyboard or screen reader user is told where they are. Focus
 * moves in the same commit as the heading, so it never rests on the page
 * between the two. Each key is a new heading, and on a page's first load,
 * when nothing was done, the heading is left alone, as any page's is.
 */
export const useHeadingFocus = (key: string, announce: boolean) => {
    const heading = useRef<HTMLHeadingElement>(null);
    useLayoutEffect(() => {
        if (announce) heading.current?.focus();
    }, [key, announce]);
    return heading;
};
