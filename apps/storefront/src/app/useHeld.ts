import { useEffect, useState } from 'react';

/**
 * Whether a state has lasted the moment given, so what shows a wait never shows for an answer that
 * comes back quickly. It stops counting as soon as the state ends, and waits the whole moment again
 * when it comes back. The wait lives here rather than in a stylesheet's delay, since the design
 * kit cuts every delay in a stylesheet to nothing for a visitor who asks for less motion, and the
 * wait is what keeps a quick answer from flickering.
 */
export const useHeld = (on: boolean, ms: number): boolean => {
    const [held, setHeld] = useState(false);
    useEffect(() => {
        if (!on) return undefined;
        const timer = window.setTimeout(() => {
            setHeld(true);
        }, ms);
        return () => {
            window.clearTimeout(timer);
            setHeld(false);
        };
    }, [on, ms]);
    return on && held;
};
