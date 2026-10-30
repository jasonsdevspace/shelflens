import type { GraphQLResolveInfo } from 'graphql';
import type {
    Product as ProductModel,
    Variant as VariantModel,
    Brand as BrandModel,
    Category as CategoryModel,
} from '@shelflens/catalog';
import type { RecommendationsModel } from '../recommend.js';
import type { HitModel, SearchResultModel, NoResultsModel, RelaxedModel } from '../resolvers.js';
import type { Facet as FacetModel } from '@jasonsdevspace/shelflens';
import type { Context } from '../context.js';
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
    readonly __typename?: 'Brand';
    readonly id: Scalars['ID']['output'];
    readonly name: Scalars['String']['output'];
};

export type Category = {
    readonly __typename?: 'Category';
    readonly id: Scalars['ID']['output'];
    readonly name: Scalars['String']['output'];
    readonly parent: Maybe<Category>;
    /** Ids from the root down to this category. */
    readonly path: ReadonlyArray<Scalars['ID']['output']>;
};

export type CustomerGroup = 'GUEST' | 'MEMBER';

export type Explanation = {
    readonly __typename?: 'Explanation';
    readonly matches: ReadonlyArray<TermMatch>;
    readonly rules: ReadonlyArray<RuleEffect>;
};

/**
 * A filter the shopper could add next, with a count beside each choice. Counts
 * ignore this facet's own current filter, so a selection never empties the
 * facet it was made in.
 */
export type Facet = {
    readonly attribute: FilterAttribute;
    readonly name: Scalars['String']['output'];
};

export type FilterAttribute =
    'BRAND' | 'CATEGORY' | 'COLOR' | 'IN_STOCK' | 'MATERIAL' | 'PRICE' | 'RATING' | 'SIZE';

/** A filter on one attribute. Exactly one of the three matchers is given. */
export type FilterInput = {
    readonly attribute: FilterAttribute;
    readonly match: MatchInput;
};

export type MatchInput =
    /** Equal to this value. For IN_STOCK, "true" or "false". */
    | {
          readonly eq: Scalars['String']['input'];
          readonly in?: never;
          readonly range?: never;
      } /** Equal to any of these values. */
    | {
          readonly eq?: never;
          readonly in: ReadonlyArray<Scalars['String']['input']>;
          readonly range?: never;
      } /** Within a numeric range. PRICE is in minor units. RATING is 0 to 5. */
    | { readonly eq?: never; readonly in?: never; readonly range: RangeInput };

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

export type Merchandising = {
    readonly __typename?: 'Merchandising';
    readonly applied: ReadonlyArray<Scalars['ID']['output']>;
    /** Rules that would have applied under a relevance sort. */
    readonly setAsideBySort: ReadonlyArray<Scalars['ID']['output']>;
};

/**
 * An amount in a currency's minor unit, such as cents. The client formats it for
 * the store's locale.
 */
export type Money = {
    readonly __typename?: 'Money';
    readonly amount: Scalars['Int']['output'];
    readonly currency: Scalars['String']['output'];
};

/**
 * What a page can offer instead of an empty one. Each part is present only
 * when it would find something.
 */
export type NoResults = {
    readonly __typename?: 'NoResults';
    /** How many products the same phrase finds with every filter removed. */
    readonly foundWithoutFilters: Scalars['Int']['output'];
    /**
     * The most rated products the viewer may see, within the category being
     * browsed. A stand-in for popularity until the store collects events.
     */
    readonly popular: ReadonlyArray<Product>;
    /**
     * The phrase with some words left out, when that finds something under
     * the same filters.
     */
    readonly relaxed: Maybe<RelaxedSearch>;
    /**
     * The phrase with each word nothing matched replaced by the nearest word
     * in use, when that finds something under the same filters.
     */
    readonly suggestion: Maybe<Scalars['String']['output']>;
};

export type PriceRange = {
    readonly __typename?: 'PriceRange';
    readonly max: Money;
    /**
     * True when the viewer's group pays below the list price. A guest pays list,
     * so for a guest this is always false, and the other price is never sent.
     */
    readonly memberPrice: Scalars['Boolean']['output'];
    readonly min: Money;
};

export type Product = {
    readonly __typename?: 'Product';
    /** When the product was added, as an ISO 8601 instant. */
    readonly addedAt: Scalars['String']['output'];
    readonly brand: Brand;
    /** The leaf category. */
    readonly category: Category;
    /** From the root down to the leaf. */
    readonly categoryPath: ReadonlyArray<Category>;
    readonly colors: ReadonlyArray<Scalars['String']['output']>;
    readonly description: Scalars['String']['output'];
    /** Whether any variant is in stock. */
    readonly inStock: Scalars['Boolean']['output'];
    readonly material: Scalars['String']['output'];
    /**
     * Shown to members only. A guest never receives such a product, so for a
     * guest this is always false, and it never names what a guest would see.
     */
    readonly membersOnly: Scalars['Boolean']['output'];
    readonly name: Scalars['String']['output'];
    /** The viewer's price. A range when variants are priced differently. */
    readonly price: PriceRange;
    /** Absent until somebody has rated it. */
    readonly rating: Maybe<Rating>;
    readonly sizes: ReadonlyArray<Scalars['String']['output']>;
    readonly sku: Scalars['ID']['output'];
    readonly variants: ReadonlyArray<Variant>;
};

/**
 * The search API of one store, as seen by one shopper.
 *
 * Who the shopper is comes from the request, not from the query, so no query
 * can ask for another customer group's prices or products. Everything a
 * response contains is the viewer's view.
 */
export type Query = {
    readonly __typename?: 'Query';
    /** The category tree, roots first. Each category's children follow it. */
    readonly categories: ReadonlyArray<Category>;
    readonly product: Maybe<Product>;
    /**
     * What to show beside a product: the products viewed with it, filled to the
     * limit with the most rated in its category, never the product itself. The
     * tab asking is taken to have viewed the product already, so what it viewed
     * before counts from the first visit. Nothing when the viewer may not see
     * the product. The answer reads the events collected so far, so it is never
     * cached.
     */
    readonly recommendations: Maybe<Recommendations>;
    /** Search the catalog. An empty phrase browses, which is how a category page works. */
    readonly search: SearchResult;
    /** The store itself, and the viewer's place in it. */
    readonly store: Store;
    /** What a phrase still being typed could become: completed queries, and products. */
    readonly suggest: Suggestions;
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
export type QueryRecommendationsArgs = {
    limit?: InputMaybe<Scalars['Int']['input']>;
    session: InputMaybe<Scalars['String']['input']>;
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
    readonly __typename?: 'RangeBucket';
    readonly count: Scalars['Int']['output'];
    readonly from: Maybe<Scalars['Float']['output']>;
    readonly to: Maybe<Scalars['Float']['output']>;
};

export type RangeFacet = Facet & {
    readonly __typename?: 'RangeFacet';
    readonly attribute: FilterAttribute;
    readonly buckets: ReadonlyArray<RangeBucket>;
    readonly name: Scalars['String']['output'];
};

/**
 * A numeric range. The lower bound is inclusive and the upper bound is exclusive,
 * so adjacent ranges never share a value.
 */
export type RangeInput = {
    readonly from?: InputMaybe<Scalars['Float']['input']>;
    readonly to?: InputMaybe<Scalars['Float']['input']>;
};

export type Rating = {
    readonly __typename?: 'Rating';
    readonly average: Scalars['Float']['output'];
    readonly count: Scalars['Int']['output'];
};

export type RecommendationSource =
    /**
     * Nothing has been viewed with this product yet, so the list is the
     * category's most rated.
     */
    | 'CATEGORY_BESTSELLERS'
    /** At least one product viewed in the same tab as this one leads the list. */
    | 'VIEWED_TOGETHER';

/** What stands beside a product, and where it came from. */
export type Recommendations = {
    readonly __typename?: 'Recommendations';
    /** The product's leaf category, which the fallback draws from. */
    readonly category: Category;
    readonly items: ReadonlyArray<Product>;
    readonly source: RecommendationSource;
};

export type RelaxedSearch = {
    readonly __typename?: 'RelaxedSearch';
    /** The words left out of the phrase as typed. */
    readonly dropped: ReadonlyArray<Scalars['String']['output']>;
    readonly phrase: Scalars['String']['output'];
    readonly result: SearchResult;
};

export type RuleAction = 'BOOST' | 'BURY' | 'PIN';

export type RuleEffect = {
    readonly __typename?: 'RuleEffect';
    readonly action: RuleAction;
    readonly ruleId: Scalars['ID']['output'];
    /** The score multiplier, for a boost or a bury. */
    readonly weight: Maybe<Scalars['Float']['output']>;
};

export type SearchHit = {
    readonly __typename?: 'SearchHit';
    /** Why this product ranked where it did. */
    readonly explanation: Explanation;
    readonly product: Product;
    readonly score: Scalars['Float']['output'];
};

export type SearchInput = {
    /** Which facets to count, by name. Every facet when omitted, none when empty. */
    readonly facets?: InputMaybe<ReadonlyArray<Scalars['String']['input']>>;
    readonly filters?: InputMaybe<ReadonlyArray<FilterInput>>;
    /** One-based. A page past the end is empty, not an error. */
    readonly page?: InputMaybe<Scalars['Int']['input']>;
    /** At most 100. Larger values are reduced, not refused. */
    readonly pageSize?: InputMaybe<Scalars['Int']['input']>;
    /** Treat the last word of the phrase as a prefix, for search as you type. */
    readonly partial?: InputMaybe<Scalars['Boolean']['input']>;
    readonly phrase?: InputMaybe<Scalars['String']['input']>;
    /**
     * The first clause orders, and each later one breaks the ties before it.
     * Relevance when omitted and there is a phrase. Position within a category
     * when browsing one. Catalog order otherwise.
     */
    readonly sort?: InputMaybe<ReadonlyArray<SortInput>>;
};

export type SearchResult = {
    readonly __typename?: 'SearchResult';
    readonly facets: ReadonlyArray<Facet>;
    readonly items: ReadonlyArray<SearchHit>;
    /**
     * How the phrase was matched. CORRECTED means nothing matched as typed and
     * one typo per word was allowed.
     */
    readonly matching: Matching;
    /** Which merchandising rules shaped this result, and which the sort set aside. */
    readonly merchandising: Merchandising;
    /** What to show instead of nothing. Null unless the search found nothing. */
    readonly noResults: Maybe<NoResults>;
    readonly page: Scalars['Int']['output'];
    readonly pageSize: Scalars['Int']['output'];
    /** The sort actually applied, after any fallback. */
    readonly sort: ReadonlyArray<SortClause>;
    /** Matching products in all, before the limit on how far a query can page. */
    readonly total: Scalars['Int']['output'];
    readonly totalPages: Scalars['Int']['output'];
};

export type SortClause = {
    readonly __typename?: 'SortClause';
    readonly by: SortField;
    readonly direction: SortDirection;
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
    readonly direction?: InputMaybe<SortDirection>;
};

/**
 * The smallest and largest value among the results, for a slider. Absent when no
 * result has a value.
 */
export type StatsFacet = Facet & {
    readonly __typename?: 'StatsFacet';
    readonly attribute: FilterAttribute;
    readonly count: Scalars['Int']['output'];
    readonly max: Maybe<Scalars['Float']['output']>;
    readonly min: Maybe<Scalars['Float']['output']>;
    readonly name: Scalars['String']['output'];
};

export type Store = {
    readonly __typename?: 'Store';
    /**
     * Changes whenever the catalog or the rules change. Part of every cache key
     * a client builds, so a stale response can never be served after an update.
     */
    readonly catalogVersion: Scalars['String']['output'];
    readonly currency: Scalars['String']['output'];
    readonly locale: Scalars['String']['output'];
    readonly name: Scalars['String']['output'];
    readonly viewer: Viewer;
};

export type Suggestions = {
    readonly __typename?: 'Suggestions';
    readonly products: ReadonlyArray<SearchHit>;
    /** Completions of the phrase, drawn from the catalog's own words. */
    readonly queries: ReadonlyArray<Scalars['String']['output']>;
};

/** One word of the phrase, and what it matched. */
export type TermMatch = {
    readonly __typename?: 'TermMatch';
    readonly field: Scalars['String']['output'];
    /** The indexed term that matched. */
    readonly matched: Scalars['String']['output'];
    readonly route: MatchRoute;
    readonly score: Scalars['Float']['output'];
    /** The word or words as the shopper typed them, normalized. */
    readonly typed: Scalars['String']['output'];
};

export type ValueBucket = {
    readonly __typename?: 'ValueBucket';
    readonly count: Scalars['Int']['output'];
    readonly value: Scalars['String']['output'];
};

export type ValueFacet = Facet & {
    readonly __typename?: 'ValueFacet';
    readonly attribute: FilterAttribute;
    readonly buckets: ReadonlyArray<ValueBucket>;
    readonly name: Scalars['String']['output'];
};

export type Variant = {
    readonly __typename?: 'Variant';
    readonly color: Scalars['String']['output'];
    readonly inStock: Scalars['Boolean']['output'];
    /** The viewer's price for this variant. */
    readonly price: Money;
    readonly size: Scalars['String']['output'];
    readonly sku: Scalars['ID']['output'];
};

/** Who is asking. Set by the request, never by the query. */
export type Viewer = {
    readonly __typename?: 'Viewer';
    readonly group: CustomerGroup;
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

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
    Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
    Brand: ResolverTypeWrapper<BrandModel>;
    Category: ResolverTypeWrapper<CategoryModel>;
    CustomerGroup: CustomerGroup;
    Explanation: ResolverTypeWrapper<Explanation>;
    Facet: ResolverTypeWrapper<FacetModel>;
    FilterAttribute: FilterAttribute;
    FilterInput: FilterInput;
    Float: ResolverTypeWrapper<Scalars['Float']['output']>;
    ID: ResolverTypeWrapper<Scalars['ID']['output']>;
    Int: ResolverTypeWrapper<Scalars['Int']['output']>;
    MatchInput: MatchInput;
    MatchRoute: MatchRoute;
    Matching: Matching;
    Merchandising: ResolverTypeWrapper<Merchandising>;
    Money: ResolverTypeWrapper<Money>;
    NoResults: ResolverTypeWrapper<NoResultsModel>;
    PriceRange: ResolverTypeWrapper<PriceRange>;
    Product: ResolverTypeWrapper<ProductModel>;
    Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
    RangeBucket: ResolverTypeWrapper<RangeBucket>;
    RangeFacet: ResolverTypeWrapper<FacetModel>;
    RangeInput: RangeInput;
    Rating: ResolverTypeWrapper<Rating>;
    RecommendationSource: RecommendationSource;
    Recommendations: ResolverTypeWrapper<RecommendationsModel>;
    RelaxedSearch: ResolverTypeWrapper<RelaxedModel>;
    RuleAction: RuleAction;
    RuleEffect: ResolverTypeWrapper<RuleEffect>;
    SearchHit: ResolverTypeWrapper<HitModel>;
    SearchInput: SearchInput;
    SearchResult: ResolverTypeWrapper<SearchResultModel>;
    SortClause: ResolverTypeWrapper<SortClause>;
    SortDirection: SortDirection;
    SortField: SortField;
    SortInput: SortInput;
    StatsFacet: ResolverTypeWrapper<FacetModel>;
    Store: ResolverTypeWrapper<Store>;
    String: ResolverTypeWrapper<Scalars['String']['output']>;
    Suggestions: ResolverTypeWrapper<
        Omit<Suggestions, 'products'> & { products: ReadonlyArray<ResolversTypes['SearchHit']> }
    >;
    TermMatch: ResolverTypeWrapper<TermMatch>;
    ValueBucket: ResolverTypeWrapper<ValueBucket>;
    ValueFacet: ResolverTypeWrapper<FacetModel>;
    Variant: ResolverTypeWrapper<VariantModel>;
    Viewer: ResolverTypeWrapper<Viewer>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
    Boolean: Scalars['Boolean']['output'];
    Brand: BrandModel;
    Category: CategoryModel;
    Explanation: Explanation;
    Facet: FacetModel;
    FilterInput: FilterInput;
    Float: Scalars['Float']['output'];
    ID: Scalars['ID']['output'];
    Int: Scalars['Int']['output'];
    MatchInput: MatchInput;
    Merchandising: Merchandising;
    Money: Money;
    NoResults: NoResultsModel;
    PriceRange: PriceRange;
    Product: ProductModel;
    Query: Record<PropertyKey, never>;
    RangeBucket: RangeBucket;
    RangeFacet: FacetModel;
    RangeInput: RangeInput;
    Rating: Rating;
    Recommendations: RecommendationsModel;
    RelaxedSearch: RelaxedModel;
    RuleEffect: RuleEffect;
    SearchHit: HitModel;
    SearchInput: SearchInput;
    SearchResult: SearchResultModel;
    SortClause: SortClause;
    SortInput: SortInput;
    StatsFacet: FacetModel;
    Store: Store;
    String: Scalars['String']['output'];
    Suggestions: Omit<Suggestions, 'products'> & {
        products: ReadonlyArray<ResolversParentTypes['SearchHit']>;
    };
    TermMatch: TermMatch;
    ValueBucket: ValueBucket;
    ValueFacet: FacetModel;
    Variant: VariantModel;
    Viewer: Viewer;
};

export type BrandResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Brand'] = ResolversParentTypes['Brand'],
> = {
    id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type CategoryResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Category'] = ResolversParentTypes['Category'],
> = {
    id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    parent?: Resolver<Maybe<ResolversTypes['Category']>, ParentType, ContextType>;
    path?: Resolver<ReadonlyArray<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type ExplanationResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Explanation'] = ResolversParentTypes['Explanation'],
> = {
    matches?: Resolver<ReadonlyArray<ResolversTypes['TermMatch']>, ParentType, ContextType>;
    rules?: Resolver<ReadonlyArray<ResolversTypes['RuleEffect']>, ParentType, ContextType>;
};

export type FacetResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Facet'] = ResolversParentTypes['Facet'],
> = {
    __resolveType: TypeResolveFn<
        'RangeFacet' | 'StatsFacet' | 'ValueFacet',
        ParentType,
        ContextType
    >;
};

export type MerchandisingResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Merchandising'] =
        ResolversParentTypes['Merchandising'],
> = {
    applied?: Resolver<ReadonlyArray<ResolversTypes['ID']>, ParentType, ContextType>;
    setAsideBySort?: Resolver<ReadonlyArray<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type MoneyResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Money'] = ResolversParentTypes['Money'],
> = {
    amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type NoResultsResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['NoResults'] = ResolversParentTypes['NoResults'],
> = {
    foundWithoutFilters?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    popular?: Resolver<ReadonlyArray<ResolversTypes['Product']>, ParentType, ContextType>;
    relaxed?: Resolver<Maybe<ResolversTypes['RelaxedSearch']>, ParentType, ContextType>;
    suggestion?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type PriceRangeResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['PriceRange'] = ResolversParentTypes['PriceRange'],
> = {
    max?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
    memberPrice?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
    min?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
};

export type ProductResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Product'] = ResolversParentTypes['Product'],
> = {
    addedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    brand?: Resolver<ResolversTypes['Brand'], ParentType, ContextType>;
    category?: Resolver<ResolversTypes['Category'], ParentType, ContextType>;
    categoryPath?: Resolver<ReadonlyArray<ResolversTypes['Category']>, ParentType, ContextType>;
    colors?: Resolver<ReadonlyArray<ResolversTypes['String']>, ParentType, ContextType>;
    description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    inStock?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
    material?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    membersOnly?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    price?: Resolver<ResolversTypes['PriceRange'], ParentType, ContextType>;
    rating?: Resolver<Maybe<ResolversTypes['Rating']>, ParentType, ContextType>;
    sizes?: Resolver<ReadonlyArray<ResolversTypes['String']>, ParentType, ContextType>;
    sku?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
    variants?: Resolver<ReadonlyArray<ResolversTypes['Variant']>, ParentType, ContextType>;
};

export type QueryResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query'],
> = {
    categories?: Resolver<ReadonlyArray<ResolversTypes['Category']>, ParentType, ContextType>;
    product?: Resolver<
        Maybe<ResolversTypes['Product']>,
        ParentType,
        ContextType,
        RequireFields<QueryProductArgs, 'sku'>
    >;
    recommendations?: Resolver<
        Maybe<ResolversTypes['Recommendations']>,
        ParentType,
        ContextType,
        RequireFields<QueryRecommendationsArgs, 'limit' | 'sku'>
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
    ContextType = Context,
    ParentType extends ResolversParentTypes['RangeBucket'] = ResolversParentTypes['RangeBucket'],
> = {
    count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    from?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
    to?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
};

export type RangeFacetResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['RangeFacet'] = ResolversParentTypes['RangeFacet'],
> = {
    attribute?: Resolver<ResolversTypes['FilterAttribute'], ParentType, ContextType>;
    buckets?: Resolver<ReadonlyArray<ResolversTypes['RangeBucket']>, ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RatingResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Rating'] = ResolversParentTypes['Rating'],
> = {
    average?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
    count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type RecommendationsResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Recommendations'] =
        ResolversParentTypes['Recommendations'],
> = {
    category?: Resolver<ResolversTypes['Category'], ParentType, ContextType>;
    items?: Resolver<ReadonlyArray<ResolversTypes['Product']>, ParentType, ContextType>;
    source?: Resolver<ResolversTypes['RecommendationSource'], ParentType, ContextType>;
};

export type RelaxedSearchResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['RelaxedSearch'] =
        ResolversParentTypes['RelaxedSearch'],
> = {
    dropped?: Resolver<ReadonlyArray<ResolversTypes['String']>, ParentType, ContextType>;
    phrase?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    result?: Resolver<ResolversTypes['SearchResult'], ParentType, ContextType>;
};

export type RuleEffectResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['RuleEffect'] = ResolversParentTypes['RuleEffect'],
> = {
    action?: Resolver<ResolversTypes['RuleAction'], ParentType, ContextType>;
    ruleId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
    weight?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
};

export type SearchHitResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['SearchHit'] = ResolversParentTypes['SearchHit'],
> = {
    explanation?: Resolver<ResolversTypes['Explanation'], ParentType, ContextType>;
    product?: Resolver<ResolversTypes['Product'], ParentType, ContextType>;
    score?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
};

export type SearchResultResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['SearchResult'] = ResolversParentTypes['SearchResult'],
> = {
    facets?: Resolver<ReadonlyArray<ResolversTypes['Facet']>, ParentType, ContextType>;
    items?: Resolver<ReadonlyArray<ResolversTypes['SearchHit']>, ParentType, ContextType>;
    matching?: Resolver<ResolversTypes['Matching'], ParentType, ContextType>;
    merchandising?: Resolver<ResolversTypes['Merchandising'], ParentType, ContextType>;
    noResults?: Resolver<Maybe<ResolversTypes['NoResults']>, ParentType, ContextType>;
    page?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    pageSize?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    sort?: Resolver<ReadonlyArray<ResolversTypes['SortClause']>, ParentType, ContextType>;
    total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    totalPages?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type SortClauseResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['SortClause'] = ResolversParentTypes['SortClause'],
> = {
    by?: Resolver<ResolversTypes['SortField'], ParentType, ContextType>;
    direction?: Resolver<ResolversTypes['SortDirection'], ParentType, ContextType>;
};

export type StatsFacetResolvers<
    ContextType = Context,
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
    ContextType = Context,
    ParentType extends ResolversParentTypes['Store'] = ResolversParentTypes['Store'],
> = {
    catalogVersion?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    locale?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    viewer?: Resolver<ResolversTypes['Viewer'], ParentType, ContextType>;
};

export type SuggestionsResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Suggestions'] = ResolversParentTypes['Suggestions'],
> = {
    products?: Resolver<ReadonlyArray<ResolversTypes['SearchHit']>, ParentType, ContextType>;
    queries?: Resolver<ReadonlyArray<ResolversTypes['String']>, ParentType, ContextType>;
};

export type TermMatchResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['TermMatch'] = ResolversParentTypes['TermMatch'],
> = {
    field?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    matched?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    route?: Resolver<ResolversTypes['MatchRoute'], ParentType, ContextType>;
    score?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
    typed?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ValueBucketResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['ValueBucket'] = ResolversParentTypes['ValueBucket'],
> = {
    count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
    value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ValueFacetResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['ValueFacet'] = ResolversParentTypes['ValueFacet'],
> = {
    attribute?: Resolver<ResolversTypes['FilterAttribute'], ParentType, ContextType>;
    buckets?: Resolver<ReadonlyArray<ResolversTypes['ValueBucket']>, ParentType, ContextType>;
    name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VariantResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Variant'] = ResolversParentTypes['Variant'],
> = {
    color?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    inStock?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
    price?: Resolver<ResolversTypes['Money'], ParentType, ContextType>;
    size?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
    sku?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type ViewerResolvers<
    ContextType = Context,
    ParentType extends ResolversParentTypes['Viewer'] = ResolversParentTypes['Viewer'],
> = {
    group?: Resolver<ResolversTypes['CustomerGroup'], ParentType, ContextType>;
};

export type Resolvers<ContextType = Context> = {
    Brand?: BrandResolvers<ContextType>;
    Category?: CategoryResolvers<ContextType>;
    Explanation?: ExplanationResolvers<ContextType>;
    Facet?: FacetResolvers<ContextType>;
    Merchandising?: MerchandisingResolvers<ContextType>;
    Money?: MoneyResolvers<ContextType>;
    NoResults?: NoResultsResolvers<ContextType>;
    PriceRange?: PriceRangeResolvers<ContextType>;
    Product?: ProductResolvers<ContextType>;
    Query?: QueryResolvers<ContextType>;
    RangeBucket?: RangeBucketResolvers<ContextType>;
    RangeFacet?: RangeFacetResolvers<ContextType>;
    Rating?: RatingResolvers<ContextType>;
    Recommendations?: RecommendationsResolvers<ContextType>;
    RelaxedSearch?: RelaxedSearchResolvers<ContextType>;
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
