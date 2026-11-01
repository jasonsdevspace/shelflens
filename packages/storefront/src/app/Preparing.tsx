import { useEffect, useState } from 'react';

/** A usual start takes about a fifth of a second, so a line shown before this would only flicker. */
export const SHOW_AFTER_MS = 400;
/** A wait this long is most likely a first visit, which is worth saying. */
export const EXPLAIN_AFTER_MS = 5000;

/**
 * What a page says while its store starts. Nothing at first, then that the
 * store is being prepared, then why it is taking a while. The status is
 * mounted empty, so each line is read as it arrives.
 */
export const Preparing = () => {
    const [waited, setWaited] = useState<'briefly' | 'a moment' | 'long'>('briefly');
    useEffect(() => {
        const shown = window.setTimeout(() => setWaited('a moment'), SHOW_AFTER_MS);
        const explained = window.setTimeout(() => setWaited('long'), EXPLAIN_AFTER_MS);
        return () => {
            window.clearTimeout(shown);
            window.clearTimeout(explained);
        };
    }, []);
    return (
        <div className="notice" role="status">
            {waited !== 'briefly' && <p>Preparing the store.</p>}
            {waited === 'long' && (
                <p>A first visit takes longer, while the store is set up in this browser.</p>
            )}
        </div>
    );
};
