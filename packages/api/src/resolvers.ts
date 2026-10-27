import { EngineError, type Facet, type Hit, type SearchResult } from '@jasonsdevspace/shelflens';
import type { Category, CustomerGroup, Product } from '@shelflens/catalog';
import { searchStore } from '@shelflens/search';

import type { Context } from './context.js';
import type { Resolvers, SearchInput } from './generated/schema.js';
import {
    attributeEnum,
    badInput,
    explanationOf,
    fromMode,
    fromSort,
    toFilter,
    toSort,
} from './translate.js';

/**
 * The resolvers: the schema's fields, answered from the store.
 *
 * Each resolver translates and nothing else. Searching belongs to the
 * engine and the store package. Deciding what a viewer may see belongs
 * there too. A resolver reads the viewer from the context, which the
 * request set, and never from an argument.
 */

/** A hit paired with its product, which the hit's id names. */
export interface HitModel {
    readonly hit: Hit;
    readonly product: Product;
}

export interface SearchResultModel {
    readonly result: SearchResult;
    readonly items: readonly HitModel[];
}

const MAX_SUGGESTIONS = 20;

const hitsOf = (result: SearchResult, context: Context): HitModel[] =>
    result.hits.flatMap((hit) => {
        const product = context.store.products.get(hit.id);
        return product ? [{ hit, product }] : [];
    });

/** The engine's refusal of a request, reported as the caller's mistake. */
const asUserError = (error: unknown): never => {
    if (error instanceof EngineError) throw badInput(error.message);
    throw error;
};

const runSearch = (input: SearchInput, context: Context): SearchResultModel => {
    try {
        const result = searchStore(context.store.engine, {
            group: context.viewer.group,
            ...(input.phrase !== null && input.phrase !== undefined && { query: input.phrase }),
            prefixLastTerm: input.partial ?? false,
            filters: (input.filters ?? []).map(toFilter),
            sort: (input.sort ?? []).map(toSort),
            page: input.page ?? 1,
            pageSize: input.pageSize ?? 20,
            ...(input.facets !== null && input.facets !== undefined && { facets: input.facets }),
            now: context.now,
        });
        return { result, items: hitsOf(result, context) };
    } catch (error) {
        return asUserError(error);
    }
};

const priceFor = (product: Product, group: CustomerGroup, currency: string) => ({
    min: { amount: product.price[group].min, currency },
    max: { amount: product.price[group].max, currency },
});

const categoryOf = (id: string, context: Context): Category => {
    const category = context.store.categories.get(id);
    if (!category) throw new Error(`a product names a category that does not exist: ${id}`);
    return category;
};

export const resolvers: Resolvers = {
    Query: {
        search: (_root, { input }, context) => runSearch(input, context),

        suggest: (_root, { phrase, limit }, context) => {
            const count = Math.min(Math.max(limit, 0), MAX_SUGGESTIONS);
            const products = runSearch(
                { phrase, partial: true, pageSize: count, facets: [] },
                context
            );
            return {
                queries: context.store.completions.complete(phrase, count),
                products: products.items,
            };
        },

        product: (_root, { sku }, context) => {
            const product = context.store.products.get(sku);
            return product?.visibleTo.includes(context.viewer.group) ? product : null;
        },

        categories: (_root, _args, context) => [...context.store.categories.values()],

        store: (_root, _args, context) => ({
            name: context.store.name,
            currency: context.store.catalog.currency,
            locale: context.store.catalog.locale,
            catalogVersion: context.store.version,
            viewer: { group: context.viewer.group === 'member' ? 'MEMBER' : 'GUEST' },
        }),
    },

    SearchResult: {
        items: ({ items }) => items,
        total: ({ result }) => result.total,
        page: ({ result }) => result.page,
        pageSize: ({ result }) => result.pageSize,
        totalPages: ({ result }) => result.totalPages,
        matching: ({ result }) => fromMode(result.mode),
        sort: ({ result }) => result.sort.map(fromSort),
        facets: ({ result }) => result.facets,
        merchandising: ({ result }) => result.rules,
    },

    SearchHit: {
        product: ({ product }) => product,
        score: ({ hit }) => hit.score,
        explanation: ({ hit }) => explanationOf(hit),
    },

    Facet: {
        __resolveType: (facet: Facet) =>
            facet.kind === 'keyword'
                ? 'ValueFacet'
                : facet.kind === 'range'
                  ? 'RangeFacet'
                  : 'StatsFacet',
    },
    ValueFacet: {
        attribute: (facet) => attributeEnum(facet.attribute) ?? badInputAttribute(facet.attribute),
        buckets: (facet) => (facet.kind === 'keyword' ? facet.buckets : []),
    },
    RangeFacet: {
        attribute: (facet) => attributeEnum(facet.attribute) ?? badInputAttribute(facet.attribute),
        buckets: (facet) =>
            facet.kind === 'range'
                ? facet.buckets.map((bucket) => ({
                      from: bucket.from ?? null,
                      to: bucket.to ?? null,
                      count: bucket.count,
                  }))
                : [],
    },
    StatsFacet: {
        attribute: (facet) => attributeEnum(facet.attribute) ?? badInputAttribute(facet.attribute),
        count: (facet) => (facet.kind === 'stats' ? facet.count : 0),
        min: (facet) => (facet.kind === 'stats' ? (facet.min ?? null) : null),
        max: (facet) => (facet.kind === 'stats' ? (facet.max ?? null) : null),
    },

    Product: {
        brand: (product, _args, context) => {
            const brand = context.store.brands.get(product.brandId);
            if (!brand)
                throw new Error(`a product names a brand that does not exist: ${product.brandId}`);
            return brand;
        },
        category: (product, _args, context) => categoryOf(product.categoryId, context),
        categoryPath: (product, _args, context) =>
            product.categoryPath.map((id) => categoryOf(id, context)),
        price: (product, _args, context) =>
            priceFor(product, context.viewer.group, context.store.catalog.currency),
        rating: (product) => (product.rating.count > 0 ? product.rating : null),
        inStock: (product) => product.variants.some((variant) => variant.inStock),
        addedAt: (product) => product.createdAt,
    },

    Variant: {
        price: (variant, _args, context) => ({
            amount: context.viewer.group === 'member' ? variant.memberPrice : variant.price,
            currency: context.store.catalog.currency,
        }),
    },

    Category: {
        parent: (category, _args, context) =>
            category.parentId ? (context.store.categories.get(category.parentId) ?? null) : null,
    },
};

/** A facet over an attribute the schema does not name is a configuration mistake, not a request's. */
const badInputAttribute = (attribute: string): never => {
    throw new Error(`a facet reports an attribute the schema does not name: ${attribute}`);
};
