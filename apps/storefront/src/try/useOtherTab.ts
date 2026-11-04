import { type RefObject, useLayoutEffect, useRef } from 'react';

import { type Loaded, readLoaded } from '../client/catalog.js';

/**
 * Another tab of this site shares the worker, so it can remove the products
 * this tab is searching, or load others. Coming back to this tab reads what
 * is loaded, and when that is no longer the version being searched, hands
 * `onChange` the products now loaded, or nothing once they are gone.
 */
export const useOtherTab = ({
    searching,
    catalogUrl,
    pending,
    onChange,
}: {
    /** The version being searched, or nothing while no store is shown. */
    readonly searching: string | undefined;
    readonly catalogUrl: string;
    /** Set while this tab has a change with the worker, which is its own to say. */
    readonly pending: RefObject<boolean>;
    readonly onChange: (loaded: Loaded | undefined) => void;
}) => {
    // The newest callback, so a draw that passes another keeps the listeners and a read in flight.
    const changed = useRef(onChange);
    useLayoutEffect(() => {
        changed.current = onChange;
    });
    // Listening starts in the same commit that shows the products, so a return from the moment they
    // appear is heard, rather than only once an effect that runs after the draw has had its turn.
    useLayoutEffect(() => {
        if (searching === undefined) return undefined;
        let live = true;
        // A return fires both a visibility change and a focus, so the two make one check. A
        // return while a read is out reads again once it lands, since the first may have been
        // answered before the other tab's change.
        let reading = false;
        let again = false;
        let queued = false;
        const read = () => {
            if (document.visibilityState !== 'visible' || pending.current) return;
            if (reading) {
                again = true;
                return;
            }
            reading = true;
            readLoaded(catalogUrl)
                .then(
                    (loaded) => {
                        // A change this tab began meanwhile is its own to say.
                        if (!live || pending.current || loaded?.version === searching) return;
                        again = false;
                        changed.current(loaded);
                    },
                    () => undefined
                )
                .finally(() => {
                    reading = false;
                    if (again && live) {
                        again = false;
                        read();
                    }
                });
        };
        const check = () => {
            if (queued) return;
            queued = true;
            queueMicrotask(() => {
                queued = false;
                read();
            });
        };
        document.addEventListener('visibilitychange', check);
        window.addEventListener('focus', check);
        return () => {
            live = false;
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('focus', check);
        };
    }, [searching, catalogUrl, pending]);
};
