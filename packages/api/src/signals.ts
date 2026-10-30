import type { StoreEvent } from './events.js';

/**
 * What the collected events say about popularity: how often each product
 * was clicked in the results, by sku. Folded into the store when it is
 * built, so a product shoppers choose rises a bounded amount in relevance
 * from the next visit on, and never within one, so paging stays stable.
 */

export type Signals = Readonly<Record<string, number>>;

export const signalsOf = (events: readonly StoreEvent[]): Signals => {
    const counts: Record<string, number> = {};
    for (const event of events) {
        if (event.kind !== 'click' || event.sku === undefined) continue;
        counts[event.sku] = (counts[event.sku] ?? 0) + 1;
    }
    return counts;
};
