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
            readonly setAside: ReadonlyArray<{
                readonly ruleId: string;
                readonly name: string | null;
                readonly pins: number;
                readonly boosts: number;
                readonly buries: number;
            }>;
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
        readonly setAside: ReadonlyArray<{
            readonly ruleId: string;
            readonly name: string | null;
            readonly pins: number;
            readonly boosts: number;
            readonly buries: number;
        }>;
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
            readonly setAside: ReadonlyArray<{
                readonly ruleId: string;
                readonly name: string | null;
                readonly pins: number;
                readonly boosts: number;
                readonly buries: number;
            }>;
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
        readonly version: string;
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
export const CardFragmentDoc = new TypedDocumentString('', {
    fragmentName: 'Card',
}) as unknown as TypedDocumentString<CardFragment, unknown>;
export const ResultsFragmentDoc = new TypedDocumentString('', {
    fragmentName: 'Results',
}) as unknown as TypedDocumentString<ResultsFragment, unknown>;
export const CategoriesDocument = new TypedDocumentString('', {
    hash: '463ddcc741f6ba20223714607b778a7cdb236fc1d16e2939567560d699374587',
}) as unknown as TypedDocumentString<CategoriesQuery, CategoriesQueryVariables>;
export const PreviewDocument = new TypedDocumentString('', {
    hash: '0d4497b4302415afd4520df59e31b87b04a58c268fbfcf618c07c7e6db8ca726',
}) as unknown as TypedDocumentString<PreviewQuery, PreviewQueryVariables>;
export const ProductDocument = new TypedDocumentString('', {
    hash: '63abfd335812efa73bfcb9cb96c3eacbf11e8fa6777186785c8d97461da2950b',
}) as unknown as TypedDocumentString<ProductQuery, ProductQueryVariables>;
export const RecommendationsDocument = new TypedDocumentString('', {
    hash: 'bfa8279da724de11d5d50e9155585444cea7b04df4dfc6ea021adec87b0769cf',
}) as unknown as TypedDocumentString<RecommendationsQuery, RecommendationsQueryVariables>;
export const SearchDocument = new TypedDocumentString('', {
    hash: '70eac46c5823ae3812fb5b6b5e64b4ad78bfd7cab0e0568fafeae97e4d4defec',
}) as unknown as TypedDocumentString<SearchQuery, SearchQueryVariables>;
export const StoreDocument = new TypedDocumentString('', {
    hash: 'eb7c84d125b3ed0449afca358e642b6a548fa289c526332c9e9ad0564d5397d0',
}) as unknown as TypedDocumentString<StoreQuery, StoreQueryVariables>;
export const SuggestDocument = new TypedDocumentString('', {
    hash: '731d13d2ca8459eba1de835dc3f7c739878280e52319d26aa64680f88b443116',
}) as unknown as TypedDocumentString<SuggestQuery, SuggestQueryVariables>;
