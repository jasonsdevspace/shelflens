import { useEffect, useRef, useState } from 'react';

import { discardRules } from '../client/rules.js';

const NOT_RESTORED = 'Your rules could not be discarded. Try again.';

/** The two steps of giving up a saved set, and what the host said if it refused. */
export interface Discard {
    /** Whether the control is asking the visitor to confirm. */
    readonly asking: boolean;
    readonly ask: (asking: boolean) => void;
    /** The host's words when it refused, until the visitor moves on. */
    readonly failure: string | undefined;
    /** Asks the host to discard the saved set. */
    readonly discard: () => Promise<void>;
}

/**
 * Giving up a saved set, held where it is used so whoever draws the control can draw it again
 * without losing the step the visitor was on. A new `moment` lets the step and any refusal go,
 * as when the visitor moves on, and a refusal of a discard asked in an earlier moment is dropped,
 * so it is never said once it no longer applies. A discard the host accepted is always passed on.
 */
export const useDiscard = (
    rulesUrl: string,
    onReset: () => void,
    moment: string | number
): Discard => {
    const [asking, setAsking] = useState(false);
    const [failure, setFailure] = useState<string>();
    const [seen, setSeen] = useState(moment);
    if (seen !== moment) {
        setSeen(moment);
        setAsking(false);
        setFailure(undefined);
    }
    // The moment now, for an answer that lands after it moved on.
    const now = useRef(moment);
    useEffect(() => {
        now.current = moment;
    }, [moment]);
    const discard = async () => {
        const askedIn = moment;
        const discarded = await discardRules(rulesUrl);
        // A discard the host accepted is passed on whenever it lands, so the page shows the
        // store's own rules. Only the words are dropped once the visitor has moved on.
        if (discarded.ok) onReset();
        if (now.current !== askedIn) return;
        setAsking(false);
        setFailure(discarded.ok ? undefined : (discarded.reason ?? NOT_RESTORED));
    };
    return { asking, ask: setAsking, failure, discard };
};
