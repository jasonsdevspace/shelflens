/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
    T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type AttributeMatchInput = {
    readonly name: string;
    readonly value: string;
};

export type CustomerGroup = 'GUEST' | 'MEMBER';

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

export type MatchRoute =
    /** The matched term is one typo from the typed word. */
    | 'CORRECTED'
    | 'EXACT'
    /** The typed word is the start of the matched one. */
    | 'PREFIX'
    | 'SYNONYM';

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

export type RecommendationSource =
    /** The old name for CATEGORY_MOST_RATED, which nothing answers with any more. */
    | 'CATEGORY_BESTSELLERS'
    /**
     * Nothing has been viewed with this product yet, so the list is the
     * category's most rated.
     */
    | 'CATEGORY_MOST_RATED'
    /** At least one product viewed in the same tab as this one leads the list. */
    | 'VIEWED_TOGETHER';

export type RuleAction = 'BOOST' | 'BURY' | 'PIN';

export type RuleAdjustmentInput = {
    readonly attribute?: AttributeMatchInput | null | undefined;
    readonly ids?: ReadonlyArray<string | number> | null | undefined;
    /** What the score is multiplied by: above one boosts, below one buries. */
    readonly weight: number;
};

export type RuleFilterInput = {
    readonly attribute: string;
    readonly value: string;
};

/**
 * A merchandising rule as the rules file spells it: when it applies, and
 * what it does. A rule with no action, or one that names a product or an
 * attribute the store does not have, is refused with the engine's own words.
 */
export type RuleInput = {
    readonly active?: RuleWindowInput | null | undefined;
    readonly boost?: ReadonlyArray<RuleAdjustmentInput> | null | undefined;
    readonly bury?: ReadonlyArray<RuleAdjustmentInput> | null | undefined;
    readonly hide?: ReadonlyArray<string | number> | null | undefined;
    readonly id: string | number;
    readonly name?: string | null | undefined;
    /** Products placed first, in this order, whether or not they matched. */
    readonly pin?: ReadonlyArray<string | number> | null | undefined;
    readonly when?: RuleTriggerInput | null | undefined;
};

export type RuleTriggerInput = {
    /** A filter the search must carry for the rule to apply. */
    readonly filter?: RuleFilterInput | null | undefined;
    /** The searches the rule applies to, each normalized the way a query is. */
    readonly queries?: ReadonlyArray<string> | null | undefined;
};

/** When the rule is in effect, as ISO dates. Either end may be open. */
export type RuleWindowInput = {
    readonly from?: string | null | undefined;
    readonly to?: string | null | undefined;
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

export type CategoriesQueryVariables = Exact<{ [key: string]: never }>;

export type CategoriesQuery = {
    readonly categories: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly path: ReadonlyArray<string>;
    }>;
};

export type PreviewQueryVariables = Exact<{
    input: SearchInput;
    explain?: boolean | null | undefined;
    rules: ReadonlyArray<RuleInput> | RuleInput;
}>;

export type PreviewQuery = {
    readonly preview: {
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
        readonly matching: Matching;
        readonly sort: ReadonlyArray<{ readonly by: SortField; readonly direction: SortDirection }>;
        readonly merchandising: {
            readonly applied: ReadonlyArray<string>;
            readonly setAsideBySort: ReadonlyArray<string>;
        };
        readonly items: ReadonlyArray<{
            readonly score?: number;
            readonly explanation?: {
                readonly matches: ReadonlyArray<{
                    readonly typed: string;
                    readonly matched: string;
                    readonly field: string;
                    readonly route: MatchRoute;
                }>;
                readonly rules: ReadonlyArray<{
                    readonly ruleId: string;
                    readonly action: RuleAction;
                    readonly weight: number | null;
                }>;
                readonly popularity: { readonly clicks: number; readonly weight: number } | null;
            };
            readonly product: {
                readonly sku: string;
                readonly name: string;
                readonly colors: ReadonlyArray<string>;
                readonly membersOnly: boolean;
                readonly inStock: boolean;
                readonly brand: { readonly name: string };
                readonly price: {
                    readonly memberPrice: boolean;
                    readonly min: { readonly amount: number; readonly currency: string };
                    readonly max: { readonly amount: number; readonly currency: string };
                };
                readonly rating: { readonly average: number; readonly count: number } | null;
            };
        }>;
        readonly noResults: {
            readonly suggestion: string | null;
            readonly foundWithoutFilters: number;
            readonly relaxed: {
                readonly phrase: string;
                readonly dropped: ReadonlyArray<string>;
                readonly result: {
                    readonly total: number;
                    readonly items: ReadonlyArray<{
                        readonly product: {
                            readonly sku: string;
                            readonly name: string;
                            readonly colors: ReadonlyArray<string>;
                            readonly membersOnly: boolean;
                            readonly inStock: boolean;
                            readonly brand: { readonly name: string };
                            readonly price: {
                                readonly memberPrice: boolean;
                                readonly min: {
                                    readonly amount: number;
                                    readonly currency: string;
                                };
                                readonly max: {
                                    readonly amount: number;
                                    readonly currency: string;
                                };
                            };
                            readonly rating: {
                                readonly average: number;
                                readonly count: number;
                            } | null;
                        };
                    }>;
                };
            } | null;
            readonly popular: ReadonlyArray<{
                readonly sku: string;
                readonly name: string;
                readonly colors: ReadonlyArray<string>;
                readonly membersOnly: boolean;
                readonly inStock: boolean;
                readonly brand: { readonly name: string };
                readonly price: {
                    readonly memberPrice: boolean;
                    readonly min: { readonly amount: number; readonly currency: string };
                    readonly max: { readonly amount: number; readonly currency: string };
                };
                readonly rating: { readonly average: number; readonly count: number } | null;
            }>;
        } | null;
        readonly facets: ReadonlyArray<
            | {
                  readonly name: string;
                  readonly attribute: FilterAttribute;
                  readonly ranges: ReadonlyArray<{
                      readonly from: number | null;
                      readonly to: number | null;
                      readonly count: number;
                  }>;
              }
            | {
                  readonly count: number;
                  readonly min: number | null;
                  readonly max: number | null;
                  readonly name: string;
                  readonly attribute: FilterAttribute;
              }
            | {
                  readonly name: string;
                  readonly attribute: FilterAttribute;
                  readonly buckets: ReadonlyArray<{
                      readonly value: string;
                      readonly count: number;
                  }>;
              }
        >;
    };
};

export type ProductQueryVariables = Exact<{
    sku: string | number;
}>;

export type ProductQuery = {
    readonly product: {
        readonly sku: string;
        readonly name: string;
        readonly description: string;
        readonly material: string;
        readonly colors: ReadonlyArray<string>;
        readonly sizes: ReadonlyArray<string>;
        readonly inStock: boolean;
        readonly membersOnly: boolean;
        readonly brand: { readonly name: string };
        readonly categoryPath: ReadonlyArray<{ readonly id: string; readonly name: string }>;
        readonly price: {
            readonly memberPrice: boolean;
            readonly min: { readonly amount: number; readonly currency: string };
            readonly max: { readonly amount: number; readonly currency: string };
            readonly listPrice: {
                readonly min: { readonly amount: number; readonly currency: string };
                readonly max: { readonly amount: number; readonly currency: string };
            } | null;
        };
        readonly rating: { readonly average: number; readonly count: number } | null;
        readonly variants: ReadonlyArray<{
            readonly sku: string;
            readonly color: string;
            readonly size: string;
            readonly inStock: boolean;
            readonly price: { readonly amount: number; readonly currency: string };
        }>;
    } | null;
};

export type RecommendationsQueryVariables = Exact<{
    sku: string | number;
    limit?: number | null | undefined;
    session?: string | null | undefined;
}>;

export type RecommendationsQuery = {
    readonly recommendations: {
        readonly source: RecommendationSource;
        readonly viewedTogether: number;
        readonly category: { readonly id: string; readonly name: string };
        readonly items: ReadonlyArray<{
            readonly sku: string;
            readonly name: string;
            readonly colors: ReadonlyArray<string>;
            readonly membersOnly: boolean;
            readonly inStock: boolean;
            readonly brand: { readonly name: string };
            readonly price: {
                readonly memberPrice: boolean;
                readonly min: { readonly amount: number; readonly currency: string };
                readonly max: { readonly amount: number; readonly currency: string };
            };
            readonly rating: { readonly average: number; readonly count: number } | null;
        }>;
    } | null;
};

export type CardFragment = {
    readonly sku: string;
    readonly name: string;
    readonly colors: ReadonlyArray<string>;
    readonly membersOnly: boolean;
    readonly inStock: boolean;
    readonly brand: { readonly name: string };
    readonly price: {
        readonly memberPrice: boolean;
        readonly min: { readonly amount: number; readonly currency: string };
        readonly max: { readonly amount: number; readonly currency: string };
    };
    readonly rating: { readonly average: number; readonly count: number } | null;
};

export type ResultsFragment = {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
    readonly matching: Matching;
    readonly sort: ReadonlyArray<{ readonly by: SortField; readonly direction: SortDirection }>;
    readonly merchandising: {
        readonly applied: ReadonlyArray<string>;
        readonly setAsideBySort: ReadonlyArray<string>;
    };
    readonly items: ReadonlyArray<{
        readonly score?: number;
        readonly explanation?: {
            readonly matches: ReadonlyArray<{
                readonly typed: string;
                readonly matched: string;
                readonly field: string;
                readonly route: MatchRoute;
            }>;
            readonly rules: ReadonlyArray<{
                readonly ruleId: string;
                readonly action: RuleAction;
                readonly weight: number | null;
            }>;
            readonly popularity: { readonly clicks: number; readonly weight: number } | null;
        };
        readonly product: {
            readonly sku: string;
            readonly name: string;
            readonly colors: ReadonlyArray<string>;
            readonly membersOnly: boolean;
            readonly inStock: boolean;
            readonly brand: { readonly name: string };
            readonly price: {
                readonly memberPrice: boolean;
                readonly min: { readonly amount: number; readonly currency: string };
                readonly max: { readonly amount: number; readonly currency: string };
            };
            readonly rating: { readonly average: number; readonly count: number } | null;
        };
    }>;
    readonly noResults: {
        readonly suggestion: string | null;
        readonly foundWithoutFilters: number;
        readonly relaxed: {
            readonly phrase: string;
            readonly dropped: ReadonlyArray<string>;
            readonly result: {
                readonly total: number;
                readonly items: ReadonlyArray<{
                    readonly product: {
                        readonly sku: string;
                        readonly name: string;
                        readonly colors: ReadonlyArray<string>;
                        readonly membersOnly: boolean;
                        readonly inStock: boolean;
                        readonly brand: { readonly name: string };
                        readonly price: {
                            readonly memberPrice: boolean;
                            readonly min: { readonly amount: number; readonly currency: string };
                            readonly max: { readonly amount: number; readonly currency: string };
                        };
                        readonly rating: {
                            readonly average: number;
                            readonly count: number;
                        } | null;
                    };
                }>;
            };
        } | null;
        readonly popular: ReadonlyArray<{
            readonly sku: string;
            readonly name: string;
            readonly colors: ReadonlyArray<string>;
            readonly membersOnly: boolean;
            readonly inStock: boolean;
            readonly brand: { readonly name: string };
            readonly price: {
                readonly memberPrice: boolean;
                readonly min: { readonly amount: number; readonly currency: string };
                readonly max: { readonly amount: number; readonly currency: string };
            };
            readonly rating: { readonly average: number; readonly count: number } | null;
        }>;
    } | null;
    readonly facets: ReadonlyArray<
        | {
              readonly name: string;
              readonly attribute: FilterAttribute;
              readonly ranges: ReadonlyArray<{
                  readonly from: number | null;
                  readonly to: number | null;
                  readonly count: number;
              }>;
          }
        | {
              readonly count: number;
              readonly min: number | null;
              readonly max: number | null;
              readonly name: string;
              readonly attribute: FilterAttribute;
          }
        | {
              readonly name: string;
              readonly attribute: FilterAttribute;
              readonly buckets: ReadonlyArray<{ readonly value: string; readonly count: number }>;
          }
    >;
};

export type SearchQueryVariables = Exact<{
    input: SearchInput;
    explain?: boolean | null | undefined;
}>;

export type SearchQuery = {
    readonly search: {
        readonly total: number;
        readonly page: number;
        readonly pageSize: number;
        readonly totalPages: number;
        readonly matching: Matching;
        readonly sort: ReadonlyArray<{ readonly by: SortField; readonly direction: SortDirection }>;
        readonly merchandising: {
            readonly applied: ReadonlyArray<string>;
            readonly setAsideBySort: ReadonlyArray<string>;
        };
        readonly items: ReadonlyArray<{
            readonly score?: number;
            readonly explanation?: {
                readonly matches: ReadonlyArray<{
                    readonly typed: string;
                    readonly matched: string;
                    readonly field: string;
                    readonly route: MatchRoute;
                }>;
                readonly rules: ReadonlyArray<{
                    readonly ruleId: string;
                    readonly action: RuleAction;
                    readonly weight: number | null;
                }>;
                readonly popularity: { readonly clicks: number; readonly weight: number } | null;
            };
            readonly product: {
                readonly sku: string;
                readonly name: string;
                readonly colors: ReadonlyArray<string>;
                readonly membersOnly: boolean;
                readonly inStock: boolean;
                readonly brand: { readonly name: string };
                readonly price: {
                    readonly memberPrice: boolean;
                    readonly min: { readonly amount: number; readonly currency: string };
                    readonly max: { readonly amount: number; readonly currency: string };
                };
                readonly rating: { readonly average: number; readonly count: number } | null;
            };
        }>;
        readonly noResults: {
            readonly suggestion: string | null;
            readonly foundWithoutFilters: number;
            readonly relaxed: {
                readonly phrase: string;
                readonly dropped: ReadonlyArray<string>;
                readonly result: {
                    readonly total: number;
                    readonly items: ReadonlyArray<{
                        readonly product: {
                            readonly sku: string;
                            readonly name: string;
                            readonly colors: ReadonlyArray<string>;
                            readonly membersOnly: boolean;
                            readonly inStock: boolean;
                            readonly brand: { readonly name: string };
                            readonly price: {
                                readonly memberPrice: boolean;
                                readonly min: {
                                    readonly amount: number;
                                    readonly currency: string;
                                };
                                readonly max: {
                                    readonly amount: number;
                                    readonly currency: string;
                                };
                            };
                            readonly rating: {
                                readonly average: number;
                                readonly count: number;
                            } | null;
                        };
                    }>;
                };
            } | null;
            readonly popular: ReadonlyArray<{
                readonly sku: string;
                readonly name: string;
                readonly colors: ReadonlyArray<string>;
                readonly membersOnly: boolean;
                readonly inStock: boolean;
                readonly brand: { readonly name: string };
                readonly price: {
                    readonly memberPrice: boolean;
                    readonly min: { readonly amount: number; readonly currency: string };
                    readonly max: { readonly amount: number; readonly currency: string };
                };
                readonly rating: { readonly average: number; readonly count: number } | null;
            }>;
        } | null;
        readonly facets: ReadonlyArray<
            | {
                  readonly name: string;
                  readonly attribute: FilterAttribute;
                  readonly ranges: ReadonlyArray<{
                      readonly from: number | null;
                      readonly to: number | null;
                      readonly count: number;
                  }>;
              }
            | {
                  readonly count: number;
                  readonly min: number | null;
                  readonly max: number | null;
                  readonly name: string;
                  readonly attribute: FilterAttribute;
              }
            | {
                  readonly name: string;
                  readonly attribute: FilterAttribute;
                  readonly buckets: ReadonlyArray<{
                      readonly value: string;
                      readonly count: number;
                  }>;
              }
        >;
    };
};

export type StoreQueryVariables = Exact<{ [key: string]: never }>;

export type StoreQuery = {
    readonly store: {
        readonly name: string;
        readonly currency: string;
        readonly locale: string;
        readonly catalogVersion: string;
        readonly rulesEdited: boolean;
        readonly memberPricing: boolean;
        readonly membersOnlyProducts: boolean;
        readonly viewer: { readonly group: CustomerGroup };
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
export const CardFragmentDoc = new TypedDocumentString(
    `
    fragment Card on Product {
  sku
  name
  colors
  brand {
    name
  }
  membersOnly
  price {
    memberPrice
    min {
      amount
      currency
    }
    max {
      amount
      currency
    }
  }
  rating {
    average
    count
  }
  inStock
}
    `,
    { fragmentName: 'Card' }
) as unknown as TypedDocumentString<CardFragment, unknown>;
export const ResultsFragmentDoc = new TypedDocumentString(
    `
    fragment Results on SearchResult {
  total
  page
  pageSize
  totalPages
  matching
  sort {
    by
    direction
  }
  merchandising {
    applied
    setAsideBySort
  }
  items {
    score @include(if: $explain)
    explanation @include(if: $explain) {
      matches {
        typed
        matched
        field
        route
      }
      rules {
        ruleId
        action
        weight
      }
      popularity {
        clicks
        weight
      }
    }
    product {
      ...Card
    }
  }
  noResults {
    suggestion
    foundWithoutFilters
    relaxed {
      phrase
      dropped
      result {
        total
        items {
          product {
            ...Card
          }
        }
      }
    }
    popular {
      ...Card
    }
  }
  facets {
    name
    attribute
    ... on ValueFacet {
      buckets {
        value
        count
      }
    }
    ... on RangeFacet {
      ranges: buckets {
        from
        to
        count
      }
    }
    ... on StatsFacet {
      count
      min
      max
    }
  }
}
    fragment Card on Product {
  sku
  name
  colors
  brand {
    name
  }
  membersOnly
  price {
    memberPrice
    min {
      amount
      currency
    }
    max {
      amount
      currency
    }
  }
  rating {
    average
    count
  }
  inStock
}`,
    { fragmentName: 'Results' }
) as unknown as TypedDocumentString<ResultsFragment, unknown>;
export const CategoriesDocument = new TypedDocumentString(
    `
    query Categories {
  categories {
    id
    name
    path
  }
}
    `,
    { hash: '463ddcc741f6ba20223714607b778a7cdb236fc1d16e2939567560d699374587' }
) as unknown as TypedDocumentString<CategoriesQuery, CategoriesQueryVariables>;
export const PreviewDocument = new TypedDocumentString(
    `
    query Preview($input: SearchInput!, $explain: Boolean = false, $rules: [RuleInput!]!) {
  preview(input: $input, rules: $rules) {
    ...Results
  }
}
    fragment Card on Product {
  sku
  name
  colors
  brand {
    name
  }
  membersOnly
  price {
    memberPrice
    min {
      amount
      currency
    }
    max {
      amount
      currency
    }
  }
  rating {
    average
    count
  }
  inStock
}
fragment Results on SearchResult {
  total
  page
  pageSize
  totalPages
  matching
  sort {
    by
    direction
  }
  merchandising {
    applied
    setAsideBySort
  }
  items {
    score @include(if: $explain)
    explanation @include(if: $explain) {
      matches {
        typed
        matched
        field
        route
      }
      rules {
        ruleId
        action
        weight
      }
      popularity {
        clicks
        weight
      }
    }
    product {
      ...Card
    }
  }
  noResults {
    suggestion
    foundWithoutFilters
    relaxed {
      phrase
      dropped
      result {
        total
        items {
          product {
            ...Card
          }
        }
      }
    }
    popular {
      ...Card
    }
  }
  facets {
    name
    attribute
    ... on ValueFacet {
      buckets {
        value
        count
      }
    }
    ... on RangeFacet {
      ranges: buckets {
        from
        to
        count
      }
    }
    ... on StatsFacet {
      count
      min
      max
    }
  }
}`,
    { hash: 'beccaf1eab8e94219df1864319400dd49adc3491559463464b4ea0d87d19721b' }
) as unknown as TypedDocumentString<PreviewQuery, PreviewQueryVariables>;
export const ProductDocument = new TypedDocumentString(
    `
    query Product($sku: ID!) {
  product(sku: $sku) {
    sku
    name
    description
    material
    colors
    sizes
    inStock
    brand {
      name
    }
    categoryPath {
      id
      name
    }
    membersOnly
    price {
      memberPrice
      min {
        amount
        currency
      }
      max {
        amount
        currency
      }
      listPrice {
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
    rating {
      average
      count
    }
    variants {
      sku
      color
      size
      inStock
      price {
        amount
        currency
      }
    }
  }
}
    `,
    { hash: '63abfd335812efa73bfcb9cb96c3eacbf11e8fa6777186785c8d97461da2950b' }
) as unknown as TypedDocumentString<ProductQuery, ProductQueryVariables>;
export const RecommendationsDocument = new TypedDocumentString(
    `
    query Recommendations($sku: ID!, $limit: Int = 6, $session: String) {
  recommendations(sku: $sku, limit: $limit, session: $session) {
    source
    viewedTogether
    category {
      id
      name
    }
    items {
      ...Card
    }
  }
}
    fragment Card on Product {
  sku
  name
  colors
  brand {
    name
  }
  membersOnly
  price {
    memberPrice
    min {
      amount
      currency
    }
    max {
      amount
      currency
    }
  }
  rating {
    average
    count
  }
  inStock
}`,
    { hash: 'bfa8279da724de11d5d50e9155585444cea7b04df4dfc6ea021adec87b0769cf' }
) as unknown as TypedDocumentString<RecommendationsQuery, RecommendationsQueryVariables>;
export const SearchDocument = new TypedDocumentString(
    `
    query Search($input: SearchInput!, $explain: Boolean = false) {
  search(input: $input) {
    ...Results
  }
}
    fragment Card on Product {
  sku
  name
  colors
  brand {
    name
  }
  membersOnly
  price {
    memberPrice
    min {
      amount
      currency
    }
    max {
      amount
      currency
    }
  }
  rating {
    average
    count
  }
  inStock
}
fragment Results on SearchResult {
  total
  page
  pageSize
  totalPages
  matching
  sort {
    by
    direction
  }
  merchandising {
    applied
    setAsideBySort
  }
  items {
    score @include(if: $explain)
    explanation @include(if: $explain) {
      matches {
        typed
        matched
        field
        route
      }
      rules {
        ruleId
        action
        weight
      }
      popularity {
        clicks
        weight
      }
    }
    product {
      ...Card
    }
  }
  noResults {
    suggestion
    foundWithoutFilters
    relaxed {
      phrase
      dropped
      result {
        total
        items {
          product {
            ...Card
          }
        }
      }
    }
    popular {
      ...Card
    }
  }
  facets {
    name
    attribute
    ... on ValueFacet {
      buckets {
        value
        count
      }
    }
    ... on RangeFacet {
      ranges: buckets {
        from
        to
        count
      }
    }
    ... on StatsFacet {
      count
      min
      max
    }
  }
}`,
    { hash: '6364550e05c98c2178ccf363fbc8c495d5cc9c0ea39e311f50b46698e27c5719' }
) as unknown as TypedDocumentString<SearchQuery, SearchQueryVariables>;
export const StoreDocument = new TypedDocumentString(
    `
    query Store {
  store {
    name
    currency
    locale
    catalogVersion
    rulesEdited
    memberPricing
    membersOnlyProducts
    viewer {
      group
    }
  }
}
    `,
    { hash: '4274cfc7f70814237ca1a63c6bcc4169fc957eff449aebc3af97534f4c030a61' }
) as unknown as TypedDocumentString<StoreQuery, StoreQueryVariables>;
export const SuggestDocument = new TypedDocumentString(
    `
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
    `,
    { hash: '731d13d2ca8459eba1de835dc3f7c739878280e52319d26aa64680f88b443116' }
) as unknown as TypedDocumentString<SuggestQuery, SuggestQueryVariables>;
