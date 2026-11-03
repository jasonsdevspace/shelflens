import type { Rule } from '@jasonsdevspace/shelflens';
import type { Catalog } from '@shelflens/catalog';
import { createCompletions, createStoreEngine } from '@shelflens/search';

import type { Store } from './context.js';
import { fingerprint } from './fingerprint.js';
import { pricesDiffer } from './prices.js';
import type { Signals } from './signals.js';

/**
 * Building a store from a catalog: its engine, its lookups and its version,
 * over the index of one built from the same catalog when there is one.
 */

export interface StoreOptions {
    readonly catalog: Catalog;
    /**
     * The rules in effect, fingerprinted into the store version, so a change
     * to them changes the version without anyone having to say so.
     */
    readonly rules?: readonly Rule[];
    /**
     * How often each product was clicked, from the events the host collected
     * so far. Folded into the version too, so a store built with new clicks
     * is a new version and nothing kept under the old one is served again.
     */
    readonly signals?: Signals;
    /** Whether the rules are a set a visitor saved, which the page says. */
    readonly rulesEdited?: boolean;
    /**
     * A store built from this same catalog, whose index, completions and
     * lookups are reused, so only the rules and the clicks are applied
     * anew. Building again after a save or a visit then costs a
     * reconfigure of the engine rather than indexing the catalog.
     */
    readonly basis?: Store | undefined;
}

/**
 * The engine for a store: a reconfigure of one built from this catalog
 * already, or a new index. An engine's settings carry over a reconfigure,
 * so a reused one is given the rules and the clicks both, the clicks empty
 * when there are none.
 */
const engineFor = (
    catalog: Catalog,
    rules: readonly Rule[],
    { signals, clicked }: { readonly signals: Signals; readonly clicked: boolean },
    reused: Store | undefined
) => {
    if (reused) return reused.engine.reconfigure({ rules, signals });
    const base = createStoreEngine(catalog);
    return rules.length > 0 || clicked
        ? base.reconfigure({ rules, ...(clicked && { signals }) })
        : base;
};

/** What a store looks things up in, built from the catalog. */
const lookupsFor = (catalog: Catalog) => ({
    completions: createCompletions(catalog),
    products: new Map(catalog.products.map((product) => [product.sku, product])),
    categories: new Map(catalog.categories.map((category) => [category.id, category])),
    brands: new Map(catalog.brands.map((brand) => [brand.id, brand])),
});

/** The same lookups, taken from a store over the same catalog. */
const lookupsOf = ({ completions, products, categories, brands }: Store) => ({
    completions,
    products,
    categories,
    brands,
});

/** The store's name, as the schema gives it. */
const STORE_NAME = 'ShelfLens';

export const createStore = ({
    catalog,
    rules = [],
    signals = {},
    rulesEdited = false,
    basis,
}: StoreOptions): Store => {
    const clicked = Object.keys(signals).length > 0;
    // Only a store over this very catalog shares an index with it.
    const reused = basis?.catalog === catalog ? basis : undefined;
    return {
        name: STORE_NAME,
        catalog,
        engine: engineFor(catalog, rules, { signals, clicked }, reused),
        ...(reused ? lookupsOf(reused) : lookupsFor(catalog)),
        signals,
        clicked,
        rulesEdited,
        memberPricing: catalog.products.some(pricesDiffer),
        membersOnlyProducts: catalog.products.some(
            (product) => !product.visibleTo.includes('guest')
        ),
        version: `${catalog.version}+rules.${fingerprint(rules)}${clicked ? `+clicks.${fingerprint(signals)}` : ''}`,
    };
};
