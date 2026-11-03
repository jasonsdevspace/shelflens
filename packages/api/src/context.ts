import type { Engine } from '@jasonsdevspace/shelflens';
import type { Brand, Catalog, Category, CustomerGroup, Product } from '@shelflens/catalog';
import type { Completions } from '@shelflens/search';

import type { EventStore } from './events.js';
import type { Signals } from './signals.js';

/**
 * What every resolver can reach.
 *
 * The store part is built once per catalog, in store.ts, and shared by every
 * request. The viewer part is built per request, from the request, which is
 * the only place a customer group may come from.
 */

export interface Store {
    readonly name: string;
    readonly catalog: Catalog;
    readonly engine: Engine;
    readonly completions: Completions;
    readonly products: ReadonlyMap<string, Product>;
    readonly categories: ReadonlyMap<string, Category>;
    readonly brands: ReadonlyMap<string, Brand>;
    /** How often each product was clicked, folded in when the store was built. */
    readonly signals: Signals;
    /** Whether anything was clicked, so the clicks are folded in at all. */
    readonly clicked: boolean;
    /** Whether the rules are a set a visitor saved rather than the ones the store ships. */
    readonly rulesEdited: boolean;
    /** Whether a member's price differs from a guest's for anything, so a switch between them means something. */
    readonly memberPricing: boolean;
    /** Whether some products are for members only, so a guest may not see everything. */
    readonly membersOnlyProducts: boolean;
    /** Changes whenever the catalog, the rules or the signals change. */
    readonly version: string;
}

export interface Viewer {
    readonly group: CustomerGroup;
}

/** What a request's resolvers say about the answer as a whole. */
interface Answer {
    /**
     * The answer depends on something the cache key does not see, such as
     * the events collected so far, so no layer may keep it.
     */
    volatile: boolean;
}

export interface Context {
    readonly store: Store;
    readonly viewer: Viewer;
    /** The time, for rules with a window. Supplied by the caller, never read here. */
    readonly now: Date;
    /** The events the host collected, when it keeps any. */
    readonly events: EventStore | undefined;
    readonly answer: Answer;
}
