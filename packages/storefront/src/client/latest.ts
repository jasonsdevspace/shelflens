/**
 * Only the newest request counts.
 *
 * A popover sends a request per keystroke, and the network returns them in
 * whatever order it likes. Without this, the response to "tra" can arrive
 * after the response to "trail" and overwrite it, and the shopper sees
 * suggestions for a phrase they are no longer typing. Each run gets a
 * ticket, the previous run is aborted, and a result whose ticket is no
 * longer current is reported as stale so the caller drops it.
 */

export type Outcome<T> = { readonly stale: true } | { readonly stale: false; readonly value: T };

export interface Latest {
    run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<Outcome<T>>;
    /** Abandon whatever is in flight. Its result, if it ever comes, is stale. */
    cancel(): void;
}

const STALE: Outcome<never> = { stale: true };

export const createLatest = (): Latest => {
    let current = 0;
    let controller: AbortController | undefined;

    return {
        run: async (task) => {
            controller?.abort();
            controller = new AbortController();
            const { signal } = controller;
            current += 1;
            const ticket = current;
            try {
                const value = await task(signal);
                return ticket === current ? { stale: false, value } : STALE;
            } catch (error) {
                if (ticket !== current || signal.aborted) return STALE;
                throw error;
            }
        },
        cancel: () => {
            controller?.abort();
            controller = undefined;
            current += 1;
        },
    };
};
