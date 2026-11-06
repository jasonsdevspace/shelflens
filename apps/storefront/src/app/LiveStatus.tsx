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
 * The text a live region holds, a moment after it is given. A live region
 * announces what changes in it, not what it was created with, so the region
 * is empty on its first render and filled a moment later. Given a time to
 * settle, it waits until the text has stayed the same that long, so text that
 * changes again and again in quick succession is said once, as it ends up.
 */
export const useSaidLater = (text: string, settleMs = 0): string => {
    const [said, setSaid] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setSaid(text), settleMs);
        return () => clearTimeout(timer);
    }, [text, settleMs]);
    return said;
};

/**
 * A line said each time it changes. It stays mounted through loading, so
 * each landed answer is a change. Given a time to settle, a line that changes
 * again before that time is said only as it ends up.
 */
export const LiveStatus = ({
    text,
    settleMs = 0,
}: {
    readonly text: string;
    readonly settleMs?: number;
}) => {
    const said = useSaidLater(text, settleMs);
    return <StatusRegion>{said}</StatusRegion>;
};
