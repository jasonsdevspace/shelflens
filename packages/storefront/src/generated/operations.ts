/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
    T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type FilterAttribute =
    'BRAND' | 'CATEGORY' | 'COLOR' | 'IN_STOCK' | 'MATERIAL' | 'PRICE' | 'RATING' | 'SIZE';

/** A filter on one attribute. Exactly one of the three matchers is given. */
export type FilterInput = {
    readonly attribute: FilterAttribute;
    readonly match: MatchInput;
};

export type MatchInput =
    | {
          /** Equal to this value. For IN_STOCK, "true" or "false". */
          readonly eq: string;
          readonly in?: never;
          readonly range?: never;
      }
    | {
          readonly eq?: never; /** Equal to any of these values. */
          readonly in: ReadonlyArray<string>;
          readonly range?: never;
      }
    | {
          readonly eq?: never;
          readonly in?: never; /** Within a numeric range. PRICE is in minor units. RATING is 0 to 5. */
          readonly range: RangeInput;
      };

export type Matching =
    /** No phrase was given, so everything matched. */
    'ALL' | 'CORRECTED' | 'EXACT' | 'NONE';

/**
 * A numeric range. The lower bound is inclusive and the upper bound is exclusive,
 * so adjacent ranges never share a value.
 */
export type RangeInput = {
    readonly from?: number | null | undefined;
    readonly to?: number | null | undefined;
};

export type SearchInput = {
    /** Which facets to count, by name. Every facet when omitted, none when empty. */
    readonly facets?: ReadonlyArray<string> | null | undefined;
    readonly filters?: ReadonlyArray<FilterInput> | null | undefined;
    /** One-based. A page past the end is empty, not an error. */
    readonly page?: number | null | undefined;
    /** At most 100. Larger values are reduced, not refused. */
    readonly pageSize?: number | null | undefined;
    /** Treat the last word of the phrase as a prefix, for search as you type. */
    readonly partial?: boolean | null | undefined;
    readonly phrase?: string | null | undefined;
    /**
     * The first clause orders, and each later one breaks the ties before it.
     * Relevance when omitted and there is a phrase. Position within a category
     * when browsing one. Catalog order otherwise.
     */
    readonly sort?: ReadonlyArray<SortInput> | null | undefined;
};

export type SortDirection = 'ASC' | 'DESC';

export type SortField =
    /** When the product was added to the catalog. */
    | 'ADDED'
    /** The catalog's own order. The default when browsing without a phrase or a category. */
    | 'CATALOG'
    /**
     * A merchandiser's order within a category. Only inside a category filter,
     * and relevance otherwise.
     */
    | 'POSITION'
    /** The viewer's price, lowest first under ASC. */
    | 'PRICE'
    | 'RATING'
    | 'RELEVANCE';

export type SortInput = {
    readonly by: SortField;
    readonly direction?: SortDirection | null | undefined;
};

export type SearchQueryVariables = Exact<{
    input: SearchInput;
}>;

export type SearchQuery = {
    readonly search: {
        readonly total: number;
        readonly matching: Matching;
        readonly items: ReadonlyArray<{
            readonly product: {
                readonly sku: string;
                readonly name: string;
                readonly colors: ReadonlyArray<string>;
                readonly brand: { readonly name: string };
                readonly price: {
                    readonly min: { readonly amount: number; readonly currency: string };
                    readonly max: { readonly amount: number; readonly currency: string };
                };
            };
        }>;
    };
};

export type SuggestQueryVariables = Exact<{
    phrase: string;
    limit: number;
}>;

export type SuggestQuery = {
    readonly suggest: {
        readonly queries: ReadonlyArray<string>;
        readonly products: ReadonlyArray<{
            readonly product: {
                readonly sku: string;
                readonly name: string;
                readonly colors: ReadonlyArray<string>;
                readonly brand: { readonly name: string };
                readonly price: {
                    readonly min: { readonly amount: number; readonly currency: string };
                    readonly max: { readonly amount: number; readonly currency: string };
                };
            };
        }>;
    };
};

export class TypedDocumentString<TResult, TVariables>
    extends String
    implements DocumentTypeDecoration<TResult, TVariables>
{
    __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
    private value: string;
    public __meta__?: Record<string, any> | undefined;

    constructor(value: string, __meta__?: Record<string, any> | undefined) {
        super(value);
        this.value = value;
        this.__meta__ = __meta__;
    }

    override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
        return this.value;
    }
}

export const SearchDocument = new TypedDocumentString(`
    query Search($input: SearchInput!) {
  search(input: $input) {
    total
    matching
    items {
      product {
        sku
        name
        colors
        brand {
          name
        }
        price {
          min {
            amount
            currency
          }
          max {
            amount
            currency
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<SearchQuery, SearchQueryVariables>;
export const SuggestDocument = new TypedDocumentString(`
    query Suggest($phrase: String!, $limit: Int!) {
  suggest(phrase: $phrase, limit: $limit) {
    queries
    products {
      product {
        sku
        name
        colors
        brand {
          name
        }
        price {
          min {
            amount
            currency
          }
          max {
            amount
            currency
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<SuggestQuery, SuggestQueryVariables>;
