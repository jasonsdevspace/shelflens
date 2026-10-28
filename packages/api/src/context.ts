import type { Engine, Rule } from '@jasonsdevspace/shelflens';
import type { Brand, Catalog, Category, CustomerGroup, Product } from '@shelflens/catalog';
import { type Completions, createCompletions, createStoreEngine } from '@shelflens/search';

import { fingerprint } from './fingerprint.js';

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
    /** Changes whenever the catalog or the rules change. */
    readonly version: string;
}

export interface Viewer {
    readonly group: CustomerGroup;
}

export interface Context {
    readonly store: Store;
    readonly viewer: Viewer;
    /** The time, for rules with a window. Supplied by the caller, never read here. */
    readonly now: Date;
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
}

export const createStore = ({
    name = 'ShelfLens',
    catalog,
    rules = [],
    rulesVersion = fingerprint(rules),
}: StoreOptions): Store => {
    const base = createStoreEngine(catalog);
    const engine = rules.length > 0 ? base.reconfigure({ rules }) : base;
    return {
        name,
        catalog,
        engine,
        completions: createCompletions(catalog),
        products: new Map(catalog.products.map((product) => [product.sku, product])),
        categories: new Map(catalog.categories.map((category) => [category.id, category])),
        brands: new Map(catalog.brands.map((brand) => [brand.id, brand])),
        version: `${catalog.version}+rules.${rulesVersion}`,
    };
};

/** The customer group a request declared, or guest when it declared none. */
/** The request header that says who is shopping, read by every host of the API. */
export const GROUP_HEADER = 'shelflens-customer-group';

export const viewerFromHeader = (value: string | null | undefined): Viewer => ({
    group: value?.trim().toLowerCase() === 'member' ? 'member' : 'guest',
});
