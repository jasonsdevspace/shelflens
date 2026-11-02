import {
    createEngine,
    type Engine,
    type Facet,
    type Filter,
    type Recovery,
    type SearchRequest,
    type SearchResult,
    type SortClause,
} from '@jasonsdevspace/shelflens';
import type { Catalog, CustomerGroup } from '@shelflens/catalog';

import { priceAttribute, storeConfig, toDocuments } from './documents.js';

/**
 * Searching as a shopper.
 *
 * The shopper never names a customer group's price attribute or the
 * visibility rule. They search "price" and see what they may see, and the
 * group decides the rest. Everything that differs between a guest and a
 * member is applied here, in one place, which is what a cache key has to
 * account for later.
 */

export interface StoreSearchRequest extends Omit<SearchRequest, 'filters' | 'sort' | 'facets'> {
    readonly group: CustomerGroup;
    /** Filters as the shopper sees them, where `price` is the group's price. */
    readonly filters?: readonly Filter[];
    readonly sort?: readonly SortClause[];
    /** Facet names as the shopper sees them, where `price` is the group's price. */
    readonly facets?: readonly string[];
}

/** The facet names a shopper sees, in the order a page shows them. */
export const SHOPPER_FACETS = ['category', 'brand', 'color', 'size', 'price', 'rating'] as const;

const forGroup = (name: string, group: CustomerGroup): string =>
    name === 'price' ? priceAttribute(group) : name === 'priceStats' ? `priceStats.${group}` : name;

const asShopperFacet = (facet: Facet, group: CustomerGroup): Facet =>
    facet.name === `price.${group}`
        ? { ...facet, name: 'price', attribute: 'price' }
        : facet.name === `priceStats.${group}`
          ? { ...facet, name: 'priceStats', attribute: 'price' }
          : facet;

export const createStoreEngine = (catalog: Catalog): Engine =>
    createEngine(toDocuments(catalog), storeConfig());

/** The shopper's filters as the engine names them, prices by the group's column. */
const engineFilters = (filters: readonly Filter[], group: CustomerGroup): Filter[] =>
    filters.map((filter) =>
        filter.attribute === 'price' ? { ...filter, attribute: priceAttribute(group) } : filter
    );

/**
 * What to offer when a search found nothing. The group's visibility is
 * kept throughout, and so is any filter on the attributes named as fixed,
 * such as the category a shopper is browsing, which is a place rather
 * than a filter they chose.
 */
export const recoverStore = (
    engine: Engine,
    request: StoreSearchRequest,
    fixedAttributes: readonly string[] = []
): Recovery => {
    const { group, filters = [], sort: _sort, facets: _facets, ...rest } = request;
    const named = engineFilters(filters, group);
    return engine.recover(
        { ...rest, filters: named.filter((filter) => !fixedAttributes.includes(filter.attribute)) },
        [
            { attribute: 'visibleTo', eq: group },
            ...named.filter((filter) => fixedAttributes.includes(filter.attribute)),
        ]
    );
};

export const searchStore = (engine: Engine, request: StoreSearchRequest): SearchResult => {
    const { group, filters = [], sort = [], facets = [...SHOPPER_FACETS], ...rest } = request;
    const result = engine.search({
        ...rest,
        filters: [
            // A product the group may not see is not merely hidden from the
            // page. It is out of the results, the counts and the totals.
            { attribute: 'visibleTo', eq: group },
            ...engineFilters(filters, group),
        ],
        sort: sort.map((clause) =>
            clause.by === 'price' ? { ...clause, by: priceAttribute(group) } : clause
        ),
        facets: facets.map((name) => forGroup(name, group)),
    });
    return {
        ...result,
        sort: result.sort.map((clause) =>
            clause.by === priceAttribute(group) ? { ...clause, by: 'price' } : clause
        ),
        facets: result.facets.map((facet) => asShopperFacet(facet, group)),
    };
};

/** What a most rated list is asked for: who is looking, where, how many, and when. */
export interface MostRatedRequest {
    readonly group: CustomerGroup;
    /** Where to look, such as the category being browsed. Everywhere when there are none. */
    readonly filters?: readonly Filter[];
    readonly limit: number;
    readonly now?: Date | undefined;
}

/**
 * The products a group may see with the most ratings, then the highest
 * rated among equals, found through the store like any search, so what the
 * group may not see and what a rule hides stay out. The one list the rail
 * falls back on and the nothing-found page offers, under one name.
 */
export const mostRated = (
    engine: Engine,
    { group, filters = [], limit, now }: MostRatedRequest
): SearchResult =>
    searchStore(engine, {
        group,
        filters,
        sort: [
            { by: 'ratingCount', direction: 'desc' },
            { by: 'rating', direction: 'desc' },
        ],
        pageSize: limit,
        facets: [],
        ...(now && { now }),
    });
