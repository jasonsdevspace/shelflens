import type { StoreEvent } from './events.js';

/**
 * What the collected events say about popularity: in how many visits each
 * product was clicked in the results, by sku. A visit is the tab the click
 * came from, so one shopper opening a product again and again counts once,
 * and the signal stays the crowd's. Folded into the store when it is
 * built, so a product shoppers choose rises a bounded amount in relevance
 * from the next visit on, and never within one, so paging stays stable.
 */

export type Signals = Readonly<Record<string, number>>;

export const signalsOf = (events: readonly StoreEvent[]): Signals => {
    const visits = new Map<string, Set<string>>();
    for (const event of events) {
        if (event.kind !== 'click' || event.sku === undefined) continue;
        const seen = visits.get(event.sku) ?? new Set<string>();
        // A click with no tab counts on its own, as the one click it is.
        seen.add(event.session ?? event.id);
        visits.set(event.sku, seen);
    }
    // No prototype, so a sku spelled like a method of Object is a sku and nothing else.
    const counts: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const [sku, seen] of visits) counts[sku] = seen.size;
    return counts;
};
