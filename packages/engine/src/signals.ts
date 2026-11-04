import type { Document } from './types.js';

/**
 * Signals: how often shoppers chose each document, as a bounded nudge to its
 * score that never passes a pin or undoes a bury.
 */

/**
 * The most a signal may raise a score, as a multiplier. Below the smallest
 * boost a merchandiser would write, so a rule always says more than the
 * crowd. A pinned or buried document takes no signal at all.
 */
export const SIGNAL_CAP = 1.25;

/** How many choices it takes to reach the cap. Past it, more choices change nothing. */
export const SIGNAL_SATURATION = 100;

/**
 * What a count of choices multiplies a score by: one for none, rising with
 * the log of the count so the first few choices count most, and the cap at
 * saturation.
 */
export const signalWeight = (count: number): number => {
    if (!(count > 0)) return 1;
    const share = Math.min(1, Math.log1p(count) / Math.log1p(SIGNAL_SATURATION));
    return 1 + (SIGNAL_CAP - 1) * share;
};

/** Each document's count of choices, by document number, zero for none. */
export const signalsByDoc = (
    signals: Readonly<Record<string, number>>,
    documents: readonly Document[]
): Float64Array | undefined => {
    if (Object.keys(signals).length === 0) return undefined;
    const byDoc = new Float64Array(documents.length);
    documents.forEach(({ id }, doc) => {
        const count = Object.hasOwn(signals, id) ? signals[id] : undefined;
        if (count !== undefined && count > 0) byDoc[doc] = count;
    });
    return byDoc;
};
