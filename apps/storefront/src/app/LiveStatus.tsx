import { type ReactNode, useEffect, useState } from 'react';

/*
 * What the page says to a screen reader without showing it. Every such line
 * is one status region, out of sight, so each is read the same way.
 */

/** The region itself, saying what it holds. */
export const StatusRegion = ({ children }: { readonly children: ReactNode }) => (
    <p className="visually-hidden" role="status">
        {children}
    </p>
);

/**
 * A line said each time it changes. A live region announces what changes in
 * it, not what it was created with, so the line is empty on its first
 * render and filled a moment later, and it stays mounted through loading
 * so each landed answer is a change.
 */
export const LiveStatus = ({ text }: { readonly text: string }) => {
    const [shown, setShown] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setShown(text), 0);
        return () => clearTimeout(timer);
    }, [text]);
    return <StatusRegion>{shown}</StatusRegion>;
};
