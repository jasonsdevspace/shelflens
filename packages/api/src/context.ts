import type { Engine, Rule } from '@jasonsdevspace/shelflens';
import type { Brand, Catalog, Category, CustomerGroup, Product } from '@shelflens/catalog';
import { type Completions, createCompletions, createStoreEngine } from '@shelflens/search';

import type { EventStore } from './events.js';
import { fingerprint } from './fingerprint.js';
import type { Signals } from './signals.js';

/**
 * What every resolver can reach.
 *
 * The store part is built once per catalog and shared by every request. The
 * viewer part is built per request, from the request, which is the only
 * place a customer group may come from.
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
    /** Changes whenever the catalog, the rules or the signals change. */
    readonly version: string;
}

export interface Viewer {
    readonly group: CustomerGroup;
}

/** What a request's resolvers say about the answer as a whole. */
export interface Answer {
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

export interface StoreOptions {
    readonly name?: string;
    readonly catalog: Catalog;
    readonly rules?: readonly Rule[];
    /**
     * A version for the rules, folded into the store version. Without one
     * the rules are fingerprinted, so a change to them changes the version
     * whether or not anyone remembered to say so.
     */
    readonly rulesVersion?: string;
    /**
     * How often each product was clicked, from the events the host collected
     * so far. Folded into the version too, so a store built with new clicks
     * is a new version and nothing kept under the old one is served again.
     */
    readonly signals?: Signals;
}

export const createStore = ({
    name = 'ShelfLens',
    catalog,
    rules = [],
    rulesVersion = fingerprint(rules),
    signals = {},
}: StoreOptions): Store => {
    const base = createStoreEngine(catalog);
    const chosen = Object.keys(signals).length > 0;
    const engine =
        rules.length > 0 || chosen ? base.reconfigure({ rules, ...(chosen && { signals }) }) : base;
    return {
        name,
        catalog,
        engine,
        completions: createCompletions(catalog),
        products: new Map(catalog.products.map((product) => [product.sku, product])),
        categories: new Map(catalog.categories.map((category) => [category.id, category])),
        brands: new Map(catalog.brands.map((brand) => [brand.id, brand])),
        signals,
        version: `${catalog.version}+rules.${rulesVersion}${chosen ? `+clicks.${fingerprint(signals)}` : ''}`,
    };
};

/** The customer group a request declared, or guest when it declared none. */
/** The request header that says who is shopping, read by every host of the API. */
export const GROUP_HEADER = 'shelflens-customer-group';

export const viewerFromHeader = (value: string | null | undefined): Viewer => ({
    group: value?.trim().toLowerCase() === 'member' ? 'member' : 'guest',
});
