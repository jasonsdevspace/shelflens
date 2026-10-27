import type { GraphQLResolveInfo } from 'graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
    ID: { input: string; output: string };
    String: { input: string; output: string };
    Boolean: { input: boolean; output: boolean };
    Int: { input: number; output: number };
    Float: { input: number; output: number };
};

export type Brand = {
    __typename?: 'Brand';
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
};

export type Category = {
    __typename?: 'Category';
    id: Scalars['ID']['output'];
    name: Scalars['String']['output'];
    parent: Maybe<Category>;
    /** Ids from the root down to this category. */
    path: Array<Scalars['ID']['output']>;
};

export const CustomerGroup = {
    Guest: 'GUEST',
    Member: 'MEMBER',
} as const;

export type CustomerGroup = (typeof CustomerGroup)[keyof typeof CustomerGroup];
export type Explanation = {
    __typename?: 'Explanation';
    matches: Array<TermMatch>;
    rules: Array<RuleEffect>;
};

/**
 * A filter the shopper could add next, with a count beside each choice. Counts
 * ignore this facet's own current filter, so a selection never empties the
 * facet it was made in.
 */
export type Facet = {
    attribute: FilterAttribute;
    name: Scalars['String']['output'];
};

export const FilterAttribute = {
    Brand: 'BRAND',
    Category: 'CATEGORY',
    Color: 'COLOR',
    InStock: 'IN_STOCK',
    Material: 'MATERIAL',
    Price: 'PRICE',
    Rating: 'RATING',
    Size: 'SIZE',
} as const;

export type FilterAttribute = (typeof FilterAttribute)[keyof typeof FilterAttribute];
/** A filter on one attribute. Exactly one of the three matchers is given. */
export type FilterInput = {
    attribute: FilterAttribute;
    match: MatchInput;
};

export type MatchInput =
    /** Equal to this value. For IN_STOCK, "true" or "false". */
    | {
          eq: Scalars['String']['input'];
          in?: never;
          range?: never;
      } /** Equal to any of these values. */
    | {
          eq?: never;
          in: Array<Scalars['String']['input']>;
          range?: never;
      } /** Within a numeric range. PRICE is in minor units. RATING is 0 to 5. */
    | { eq?: never; in?: never; range: RangeInput };

export const MatchRoute = {
    /** The matched term is one typo from the typed word. */
    Corrected: 'CORRECTED',
    Exact: 'EXACT',
    /** The typed word is the start of the matched one. */
    Prefix: 'PREFIX',
    Synonym: 'SYNONYM',
} as const;

export type MatchRoute = (typeof MatchRoute)[keyof typeof MatchRoute];
export const Matching = {
    /** No phrase was given, so everything matched. */
    All: 'ALL',
    Corrected: 'CORRECTED',
    Exact: 'EXACT',
    None: 'NONE',
} as const;

export type Matching = (typeof Matching)[keyof typeof Matching];
export type Merchandising = {
    __typename?: 'Merchandising';
    applied: Array<Scalars['ID']['output']>;
    /** Rules that would have applied under a relevance sort. */
    setAsideBySort: Array<Scalars['ID']['output']>;
};

/**
 * An amount in a currency's minor unit, such as cents. The client formats it for
 * the store's locale.
 */
export type Money = {
    __typename?: 'Money';
    amount: Scalars['Int']['output'];
    currency: Scalars['String']['output'];
};

export type PriceRange = {
    __typename?: 'PriceRange';
    max: Money;
    min: Money;
};

export type Product = {
    __typename?: 'Product';
    /** When the product was added, as an ISO 8601 instant. */
    addedAt: Scalars['String']['output'];
    brand: Brand;
    /** The leaf category. */
    category: Category;
    /** From the root down to the leaf. */
    categoryPath: Array<Category>;
    colors: Array<Scalars['String']['output']>;
    description: Scalars['String']['output'];
    /** Whether any variant is in stock. */
    inStock: Scalars['Boolean']['output'];
    material: Scalars['String']['output'];
    name: Scalars['String']['output'];
    /** The viewer's price. A range when variants are priced differently. */
    price: PriceRange;
    /** Absent until somebody has rated it. */
    rating: Maybe<Rating>;
    sizes: Array<Scalars['String']['output']>;
    sku: Scalars['ID']['output'];
    variants: Array<Variant>;
};

/**
 * The search API of one store, as seen by one shopper.
 *
 * Who the shopper is comes from the request, not from the query, so no query
 * can ask for another customer group's prices or products. Everything a
 * response contains is the viewer's view.
 */
export type Query = {
    __typename?: 'Query';
    /** The category tree, roots first. Each category's children follow it. */
    categories: Array<Category>;
    product: Maybe<Product>;
    /** Search the catalog. An empty phrase browses, which is how a category page works. */
    search: SearchResult;
    /** The store itself, and the viewer's place in it. */
    store: Store;
    /** What a phrase still being typed could become: completed queries, and products. */
    suggest: Suggestions;
};

/**
 * The search API of one store, as seen by one shopper.
 *
 * Who the shopper is comes from the request, not from the query, so no query
 * can ask for another customer group's prices or products. Everything a
 * response contains is the viewer's view.
 */
export type QueryProductArgs = {
    sku: Scalars['ID']['input'];
};

/**
 * The search API of one store, as seen by one shopper.
 *
 * Who the shopper is comes from the request, not from the query, so no query
 * can ask for another customer group's prices or products. Everything a
 * response contains is the viewer's view.
 */
export type QuerySearchArgs = {
    input: SearchInput;
};

/**
 * The search API of one store, as seen by one shopper.
 *
 * Who the shopper is comes from the request, not from the query, so no query
 * can ask for another customer group's prices or products. Everything a
 * response contains is the viewer's view.
 */
export type QuerySuggestArgs = {
    limit?: InputMaybe<Scalars['Int']['input']>;
    phrase: Scalars['String']['input'];
};

/** A band of values. A missing bound is open on that side. */
export type RangeBucket = {
    __typename?: 'RangeBucket';
    count: Scalars['Int']['output'];
    from: Maybe<Scalars['Float']['output']>;
    to: Maybe<Scalars['Float']['output']>;
};

export type RangeFacet = Facet & {
    __typename?: 'RangeFacet';
    attribute: FilterAttribute;
    buckets: Array<RangeBucket>;
    name: Scalars['String']['output'];
};

/**
 * A numeric range. The lower bound is inclusive and the upper bound is exclusive,
 * so adjacent ranges never share a value.
 */
export type RangeInput = {
    from?: InputMaybe<Scalars['Float']['input']>;
    to?: InputMaybe<Scalars['Float']['input']>;
};

export type Rating = {
    __typename?: 'Rating';
    average: Scalars['Float']['output'];
    count: Scalars['Int']['output'];
};

export const RuleAction = {
    Boost: 'BOOST',
    Bury: 'BURY',
    Pin: 'PIN',
} as const;

export type RuleAction = (typeof RuleAction)[keyof typeof RuleAction];
export type RuleEffect = {
    __typename?: 'RuleEffect';
    action: RuleAction;
    ruleId: Scalars['ID']['output'];
    /** The score multiplier, for a boost or a bury. */
    weight: Maybe<Scalars['Float']['output']>;
};

export type SearchHit = {
    __typename?: 'SearchHit';
    /** Why this product ranked where it did. */
    explanation: Explanation;
    product: Product;
    score: Scalars['Float']['output'];
};

export type SearchInput = {
    /** Which facets to count, by name. Every facet when omitted, none when empty. */
    facets?: InputMaybe<Array<Scalars['String']['input']>>;
    filters?: InputMaybe<Array<FilterInput>>;
    /** One-based. A page past the end is empty, not an error. */
    page?: InputMaybe<Scalars['Int']['input']>;
    /** At most 100. Larger values are reduced, not refused. */
    pageSize?: InputMaybe<Scalars['Int']['input']>;
    /** Treat the last word of the phrase as a prefix, for search as you type. */
    partial?: InputMaybe<Scalars['Boolean']['input']>;
    phrase?: InputMaybe<Scalars['String']['input']>;
    /**
     * The first clause orders, and each later one breaks the ties before it.
     * Relevance when omitted and there is a phrase. Position within a category
     * when browsing one. Catalog order otherwise.
     */
    sort?: InputMaybe<Array<SortInput>>;
};

export type SearchResult = {
    __typename?: 'SearchResult';
    facets: Array<Facet>;
    items: Array<SearchHit>;
    /**
     * How the phrase was matched. CORRECTED means nothing matched as typed and
     * one typo per word was allowed.
     */
    matching: Matching;
    /** Which merchandising rules shaped this result, and which the sort set aside. */
    merchandising: Merchandising;
    page: Scalars['Int']['output'];
    pageSize: Scalars['Int']['output'];
    /** The sort actually applied, after any fallback. */
    sort: Array<SortClause>;
    /** Matching products in all, before the limit on how far a query can page. */
    total: Scalars['Int']['output'];
    totalPages: Scalars['Int']['output'];
};

export type SortClause = {
    __typename?: 'SortClause';
    by: SortField;
    direction: SortDirection;
};

export const SortDirection = {
    Asc: 'ASC',
    Desc: 'DESC',
} as const;

export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];
export const SortField = {
    /** When the product was added to the catalog. */
    Added: 'ADDED',
    /**
     * A merchandiser's order within a category. Only inside a category filter,
     * and relevance otherwise.
     */
    Position: 'POSITION',
    /** The viewer's price, lowest first under ASC. */
    Price: 'PRICE',
    Rating: 'RATING',
    Relevance: 'RELEVANCE',
} as const;

export type SortField = (typeof SortField)[keyof typeof SortField];
export type SortInput = {
    by: SortField;
    direction?: InputMaybe<SortDirection>;
};

/**
 * The smallest and largest value among the results, for a slider. Absent when no
 * result has a value.
 */
export type StatsFacet = Facet & {
    __typename?: 'StatsFacet';
    attribute: FilterAttribute;
    count: Scalars['Int']['output'];
    max: Maybe<Scalars['Float']['output']>;
    min: Maybe<Scalars['Float']['output']>;
    name: Scalars['String']['output'];
};

export type Store = {
    __typename?: 'Store';
    /**
     * Changes whenever the catalog or the rules change. Part of every cache key
     * a client builds, so a stale response can never be served after an update.
     */
    catalogVersion: Scalars['String']['output'];
    currency: Scalars['String']['output'];
    locale: Scalars['String']['output'];
    name: Scalars['String']['output'];
    viewer: Viewer;
};

export type Suggestions = {
    __typename?: 'Suggestions';
    products: Array<SearchHit>;
    /** Completions of the phrase, drawn from the catalog's own words. */
    queries: Array<Scalars['String']['output']>;
};

/** One word of the phrase, and what it matched. */
export type TermMatch = {
    __typename?: 'TermMatch';
    field: Scalars['String']['output'];
    /** The indexed term that matched. */
    matched: Scalars['String']['output'];
    route: MatchRoute;
    score: Scalars['Float']['output'];
    /** The word or words as the shopper typed them, normalized. */
    typed: Scalars['String']['output'];
};

export type ValueBucket = {
    __typename?: 'ValueBucket';
    count: Scalars['Int']['output'];
    value: Scalars['String']['output'];
};

export type ValueFacet = Facet & {
    __typename?: 'ValueFacet';
    attribute: FilterAttribute;
    buckets: Array<ValueBucket>;
    name: Scalars['String']['output'];
};

export type Variant = {
    __typename?: 'Variant';
    color: Scalars['String']['output'];
    inStock: Scalars['Boolean']['output'];
    /** The viewer's price for this variant. */
    price: Money;
    size: Scalars['String']['output'];
    sku: Scalars['ID']['output'];
};

/** Who is asking. Set by the request, never by the query. */
export type Viewer = {
    __typename?: 'Viewer';
    group: CustomerGroup;
};

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
    resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<
    TResult,
    TParent = Record<PropertyKey, never>,
    TContext = Record<PropertyKey, never>,
    TArgs = Record<PropertyKey, never>,
> =
    | ResolverFn<TResult, TParent, TContext, TArgs>
    | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
    parent: TParent,
    args: TArgs,
    context: TContext,
    info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
    parent: TParent,
    args: TArgs,
    context: TContext,
    info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
    parent: TParent,
    args: TArgs,
    context: TContext,
    info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<
    TResult,
    TKey extends string,
    TParent,
    TContext,
    TArgs,
> {
    subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
    resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
    subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
    resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
    | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
    | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
    TResult,
    TKey extends string,
    TParent = Record<PropertyKey, never>,
    TContext = Record<PropertyKey, never>,
    TArgs = Record<PropertyKey, never>,
> =
    | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
    | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<
    TTypes,
    TParent = Record<PropertyKey, never>,
    TContext = Record<PropertyKey, never>,
> = (
    parent: TParent,
    context: TContext,
    info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<
    T = Record<PropertyKey, never>,
    TContext = Record<PropertyKey, never>,
> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
    TResult = Record<PropertyKey, never>,
    TParent = Record<PropertyKey, never>,
    TContext = Record<PropertyKey, never>,
    TArgs = Record<PropertyKey, never>,
> = (
    next: NextResolverFn<TResult>,
    parent: TParent,
    args: TArgs,
    context: TContext,
    info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping of interface types */
export type ResolversInterfaceTypes<_RefType extends Record<string, unknown>> = {
    Facet: Partial<RangeFacet> | Partial<StatsFacet> | Partial<ValueFacet>;
};

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
    Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']['output']>>;
    Brand: ResolverTypeWrapper<Partial<Brand>>;
    Category: ResolverTypeWrapper<Partial<Category>>;
    CustomerGroup: ResolverTypeWrapper<Partial<CustomerGroup>>;
    Explanation: ResolverTypeWrapper<Partial<Explanation>>;
    Facet: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['Facet']>;
    FilterAttribute: ResolverTypeWrapper<Partial<FilterAttribute>>;
    FilterInput: ResolverTypeWrapper<Partial<FilterInput>>;
    Float: ResolverTypeWrapper<Partial<Scalars['Float']['output']>>;
    ID: ResolverTypeWrapper<Partial<Scalars['ID']['output']>>;
    Int: ResolverTypeWrapper<Partial<Scalars['Int']['output']>>;
    MatchInput: ResolverTypeWrapper<Partial<MatchInput>>;
    MatchRoute: ResolverTypeWrapper<Partial<MatchRoute>>;
    Matching: ResolverTypeWrapper<Partial<Matching>>;
    Merchandising: ResolverTypeWrapper<Partial<Merchandising>>;
    Money: ResolverTypeWrapper<Partial<Money>>;
    PriceRange: ResolverTypeWrapper<Partial<PriceRange>>;
    Product: ResolverTypeWrapper<Partial<Product>>;
    Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
    RangeBucket: ResolverTypeWrapper<Partial<RangeBucket>>;
    RangeFacet: ResolverTypeWrapper<Partial<RangeFacet>>;
    RangeInput: ResolverTypeWrapper<Partial<RangeInput>>;
    Rating: ResolverTypeWrapper<Partial<Rating>>;
    RuleAction: ResolverTypeWrapper<Partial<RuleAction>>;
    RuleEffect: ResolverTypeWrapper<Partial<RuleEffect>>;
    SearchHit: ResolverTypeWrapper<Partial<SearchHit>>;
    SearchInput: ResolverTypeWrapper<Partial<SearchInput>>;
    SearchResult: ResolverTypeWrapper<
        Partial<Omit<SearchResult, 'facets'> & { facets: Array<ResolversTypes['Facet']> }>
    >;
    SortClause: ResolverTypeWrapper<Partial<SortClause>>;
    SortDirection: ResolverTypeWrapper<Partial<SortDirection>>;
    SortField: ResolverTypeWrapper<Partial<SortField>>;
    SortInput: ResolverTypeWrapper<Partial<SortInput>>;
    StatsFacet: ResolverTypeWrapper<Partial<StatsFacet>>;
    Store: ResolverTypeWrapper<Partial<Store>>;
    String: ResolverTypeWrapper<Partial<Scalars['String']['output']>>;
    Suggestions: ResolverTypeWrapper<Partial<Suggestions>>;
    TermMatch: ResolverTypeWrapper<Partial<TermMatch>>;
    ValueBucket: ResolverTypeWrapper<Partial<ValueBucket>>;
    ValueFacet: ResolverTypeWrapper<Partial<ValueFacet>>;
    Variant: ResolverTypeWrapper<Partial<Variant>>;
    Viewer: ResolverTypeWrapper<Partial<Viewer>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
    Boolean: Partial<Scalars['Boolean']['output']>;
    Brand: Partial<Brand>;
    Category: Partial<Category>;
    Explanation: Partial<Explanation>;
    Facet: ResolversInterfaceTypes<ResolversParentTypes>['Facet'];
    FilterInput: Partial<FilterInput>;
    Float: Partial<Scalars['Float']['output']>;
    ID: Partial<Scalars['ID']['output']>;
    Int: Partial<Scalars['Int']['output']>;
    MatchInput: Partial<MatchInput>;
    Merchandising: Partial<Merchandising>;
    Money: Partial<Money>;
    PriceRange: Partial<PriceRange>;
    Product: Partial<Product>;
    Query: Record<PropertyKey, never>;
    RangeBucket: Partial<RangeBucket>;
    RangeFacet: Partial<RangeFacet>;
    RangeInput: Partial<RangeInput>;
    Rating: Partial<Rating>;
    RuleEffect: Partial<RuleEffect>;
    SearchHit: Partial<SearchHit>;
    SearchInput: Partial<SearchInput>;
    SearchResult: Partial<
        Omit<SearchResult, 'facets'> & { facets: Array<ResolversParentTypes['Facet']> }
    >;
    SortClause: Partial<SortClause>;
    SortInput: Partial<SortInput>;
    StatsFacet: Partial<StatsFacet>;
    Store: Partial<Store>;
    String: Partial<Scalars['String']['output']>;
    Suggestions: Partial<Suggestions>;
    TermMatch: Partial<TermMatch>;
    ValueBucket: Partial<ValueBucket>;
    ValueFacet: Partial<ValueFacet>;
    Variant: Partial<Variant>;
    Viewer: Partial<Viewer>;
};

export type BrandResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Brand'] = ResolversParentTypes['Brand'],
> = {
    id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type CategoryResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Category'] = ResolversParentTypes['Category'],
> = {
    id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    parent?: Resolver<Maybe<ResolversTypes['Category']>, ParentType, ContextType>;
    path?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type ExplanationResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Explanation'] = ResolversParentTypes['Explanation'],
> = {
    matches?: Resolver<Array<ResolversTypes['TermMatch']>, ParentType, ContextType>;
    rules?: Resolver<Array<ResolversTypes['RuleEffect']>, ParentType, ContextType>;
};

export type FacetResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Facet'] = ResolversParentTypes['Facet'],
> = {
    __resolveType: TypeResolveFn<
        'RangeFacet' | 'StatsFacet' | 'ValueFacet',
        ParentType,
        ContextType
    >;
};

export type MerchandisingResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Merchandising'] =
        ResolversParentTypes['Merchandising'],
> = {
    applied?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
    setAsideBySort?: Resolver<Array<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type MoneyResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Money'] = ResolversParentTypes['Money'],
> = {
    amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type PriceRangeResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['PriceRange'] = ResolversParentTypes['PriceRange'],
> = {
    max?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
    min?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
};

export type ProductResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Product'] = ResolversParentTypes['Product'],
> = {
    addedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    brand?: Resolver<ResolversTypes['Brand'], ParentType, ContextType>;
    category?: Resolver<ResolversTypes['Category'], ParentType, ContextType>;
    categoryPath?: Resolver<Array<ResolversTypes['Category']>, ParentType, ContextType>;
    colors?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
    description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    inStock?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
    material?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    price?: Resolver<ResolversTypes['PriceRange'], ParentType, ContextType>;
    rating?: Resolver<Maybe<ResolversTypes['Rating']>, ParentType, ContextType>;
    sizes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
    sku?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
    variants?: Resolver<Array<ResolversTypes['Variant']>, ParentType, ContextType>;
};

export type QueryResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query'],
> = {
    categories?: Resolver<Array<ResolversTypes['Category']>, ParentType, ContextType>;
    product?: Resolver<
        Maybe<ResolversTypes['Product']>,
        ParentType,
        ContextType,
        RequireFields<QueryProductArgs, 'sku'>
    >;
    search?: Resolver<
        ResolversTypes['SearchResult'],
        ParentType,
        ContextType,
        RequireFields<QuerySearchArgs, 'input'>
    >;
    store?: Resolver<ResolversTypes['Store'], ParentType, ContextType>;
    suggest?: Resolver<
        ResolversTypes['Suggestions'],
        ParentType,
        ContextType,
        RequireFields<QuerySuggestArgs, 'limit' | 'phrase'>
    >;
};

export type RangeBucketResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['RangeBucket'] = ResolversParentTypes['RangeBucket'],
> = {
    count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    from?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
    to?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
};

export type RangeFacetResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['RangeFacet'] = ResolversParentTypes['RangeFacet'],
> = {
    attribute?: Resolver<ResolversTypes['FilterAttribute'], ParentType, ContextType>;
    buckets?: Resolver<Array<ResolversTypes['RangeBucket']>, ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RatingResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Rating'] = ResolversParentTypes['Rating'],
> = {
    average?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
    count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type RuleEffectResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['RuleEffect'] = ResolversParentTypes['RuleEffect'],
> = {
    action?: Resolver<ResolversTypes['RuleAction'], ParentType, ContextType>;
    ruleId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
    weight?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
};

export type SearchHitResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['SearchHit'] = ResolversParentTypes['SearchHit'],
> = {
    explanation?: Resolver<ResolversTypes['Explanation'], ParentType, ContextType>;
    product?: Resolver<ResolversTypes['Product'], ParentType, ContextType>;
    score?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
};

export type SearchResultResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['SearchResult'] = ResolversParentTypes['SearchResult'],
> = {
    facets?: Resolver<Array<ResolversTypes['Facet']>, ParentType, ContextType>;
    items?: Resolver<Array<ResolversTypes['SearchHit']>, ParentType, ContextType>;
    matching?: Resolver<ResolversTypes['Matching'], ParentType, ContextType>;
    merchandising?: Resolver<ResolversTypes['Merchandising'], ParentType, ContextType>;
    page?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    pageSize?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    sort?: Resolver<Array<ResolversTypes['SortClause']>, ParentType, ContextType>;
    total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    totalPages?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type SortClauseResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['SortClause'] = ResolversParentTypes['SortClause'],
> = {
    by?: Resolver<ResolversTypes['SortField'], ParentType, ContextType>;
    direction?: Resolver<ResolversTypes['SortDirection'], ParentType, ContextType>;
};

export type StatsFacetResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['StatsFacet'] = ResolversParentTypes['StatsFacet'],
> = {
    attribute?: Resolver<ResolversTypes['FilterAttribute'], ParentType, ContextType>;
    count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    max?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
    min?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type StoreResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Store'] = ResolversParentTypes['Store'],
> = {
    catalogVersion?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    locale?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    viewer?: Resolver<ResolversTypes['Viewer'], ParentType, ContextType>;
};

export type SuggestionsResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Suggestions'] = ResolversParentTypes['Suggestions'],
> = {
    products?: Resolver<Array<ResolversTypes['SearchHit']>, ParentType, ContextType>;
    queries?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
};

export type TermMatchResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['TermMatch'] = ResolversParentTypes['TermMatch'],
> = {
    field?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    matched?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    route?: Resolver<ResolversTypes['MatchRoute'], ParentType, ContextType>;
    score?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
    typed?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ValueBucketResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['ValueBucket'] = ResolversParentTypes['ValueBucket'],
> = {
    count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ValueFacetResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['ValueFacet'] = ResolversParentTypes['ValueFacet'],
> = {
    attribute?: Resolver<ResolversTypes['FilterAttribute'], ParentType, ContextType>;
    buckets?: Resolver<Array<ResolversTypes['ValueBucket']>, ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VariantResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Variant'] = ResolversParentTypes['Variant'],
> = {
    color?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    inStock?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
    price?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
    size?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    sku?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type ViewerResolvers<
    ContextType = any,
    ParentType extends ResolversParentTypes['Viewer'] = ResolversParentTypes['Viewer'],
> = {
    group?: Resolver<ResolversTypes['CustomerGroup'], ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
    Brand?: BrandResolvers<ContextType>;
    Category?: CategoryResolvers<ContextType>;
    Explanation?: ExplanationResolvers<ContextType>;
    Facet?: FacetResolvers<ContextType>;
    Merchandising?: MerchandisingResolvers<ContextType>;
    Money?: MoneyResolvers<ContextType>;
    PriceRange?: PriceRangeResolvers<ContextType>;
    Product?: ProductResolvers<ContextType>;
    Query?: QueryResolvers<ContextType>;
    RangeBucket?: RangeBucketResolvers<ContextType>;
    RangeFacet?: RangeFacetResolvers<ContextType>;
    Rating?: RatingResolvers<ContextType>;
    RuleEffect?: RuleEffectResolvers<ContextType>;
    SearchHit?: SearchHitResolvers<ContextType>;
    SearchResult?: SearchResultResolvers<ContextType>;
    SortClause?: SortClauseResolvers<ContextType>;
    StatsFacet?: StatsFacetResolvers<ContextType>;
    Store?: StoreResolvers<ContextType>;
    Suggestions?: SuggestionsResolvers<ContextType>;
    TermMatch?: TermMatchResolvers<ContextType>;
    ValueBucket?: ValueBucketResolvers<ContextType>;
    ValueFacet?: ValueFacetResolvers<ContextType>;
    Variant?: VariantResolvers<ContextType>;
    Viewer?: ViewerResolvers<ContextType>;
};
