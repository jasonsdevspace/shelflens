/**
 * The engine's vocabulary.
 *
 * The engine knows nothing about products. It indexes documents, each with
 * some searchable text and some attributes to filter, facet and sort by. A
 * catalog is turned into documents by whoever owns the catalog, which is
 * what keeps this package free of any one store's shape.
 */

/** An attribute's value: a word, a number, true or false, or a list of words. */
export type AttributeValue = string | number | boolean | readonly string[];

/** One thing the engine can find, such as a product. */
export interface Document {
    readonly id: string;
    /** Searchable text, by field name. Only fields named in the config are indexed. */
    readonly text: Readonly<Record<string, string>>;
    /** Values to filter, facet and sort by. Only attributes named in the config are kept. */
    readonly attributes: Readonly<Record<string, AttributeValue>>;
}

/**
 * How much a match in a field counts for.
 *
 * A match in a product's name should outrank the same match buried in its
 * description, and the weights are how that is said.
 */
export interface TextField {
    readonly weight: number;
}

/** What an attribute holds, which decides the filters, sorts and facets it takes. */
export type AttributeKind = 'keyword' | 'number' | 'boolean';

/**
 * Words a shopper uses that the catalog says differently.
 *
 * `equivalent` terms stand in for each other in both directions. A `one-way`
 * rule widens one query term to another without the reverse: "trainers" can
 * find sneakers, but "sneakers" need not find anything tagged trainers.
 */
export type SynonymRule =
    | { readonly kind: 'equivalent'; readonly terms: readonly string[] }
    | { readonly kind: 'one-way'; readonly from: string; readonly to: string };

/**
 * A facet a shopper can filter by, with a count beside each choice.
 *
 * Keyword facets list the values of an attribute. Range facets count
 * documents into fixed bands, such as price ranges, where each band's
 * upper bound is exclusive. Stats facets report the smallest and largest
 * value, which is what a slider needs.
 */
export type FacetConfig =
    | { readonly kind: 'keyword'; readonly attribute: string; readonly maxBuckets?: number }
    | {
          readonly kind: 'range';
          readonly attribute: string;
          readonly ranges: readonly { readonly from?: number; readonly to?: number }[];
      }
    | { readonly kind: 'stats'; readonly attribute: string };

/** One value of a keyword facet, and how many documents have it. */
export interface ValueBucket {
    readonly kind: 'value';
    readonly value: string;
    readonly count: number;
}

/** One band of a range facet, `from` inclusive and `to` exclusive, and how many fall in it. */
export interface RangeBucket {
    readonly kind: 'range';
    readonly from?: number;
    readonly to?: number;
    readonly count: number;
}

/** A facet's counts for one search, by the kind of facet the config declared. */
export type Facet =
    | {
          readonly name: string;
          readonly attribute: string;
          readonly kind: 'keyword';
          readonly buckets: readonly ValueBucket[];
      }
    | {
          readonly name: string;
          readonly attribute: string;
          readonly kind: 'range';
          readonly buckets: readonly RangeBucket[];
      }
    | {
          readonly name: string;
          readonly attribute: string;
          readonly kind: 'stats';
          readonly count: number;
          readonly min?: number;
          readonly max?: number;
      };

/** When a rule applies: to these queries, or inside this filter. Both widen it. */
export interface RuleTrigger {
    readonly queries?: readonly string[];
    readonly filter?: { readonly attribute: string; readonly value: string };
}

/** A score multiplier for named documents, or for every document with an attribute value. */
export interface RuleAdjustment {
    readonly ids?: readonly string[];
    readonly attribute?: { readonly name: string; readonly value: string };
    /** Above one boosts, below one buries. */
    readonly weight: number;
}

/**
 * A merchandising rule.
 *
 * Without `when`, a rule applies to every search. With `active`, it applies
 * only between those instants, given as ISO 8601 strings, and only when the
 * request says what time it is.
 */
export interface Rule {
    readonly id: string;
    readonly name?: string;
    readonly when?: RuleTrigger;
    readonly active?: { readonly from?: string; readonly to?: string };
    /** Placed first, in this order, whether or not they matched the query. */
    readonly pin?: readonly string[];
    readonly boost?: readonly RuleAdjustment[];
    readonly bury?: readonly RuleAdjustment[];
    readonly hide?: readonly string[];
}

/** What a rule did to one result, kept so explain mode can show it. */
export interface RuleEffect {
    readonly ruleId: string;
    readonly action: 'pin' | 'boost' | 'bury';
    readonly weight?: number;
}

/** What the engine indexes and how it searches. */
export interface EngineConfig {
    /** The text a query searches. Only these are indexed. */
    readonly fields: Readonly<Record<string, TextField>>;
    /** What filters, sorts, facets and rules may name. Only these are kept. */
    readonly attributes: Readonly<Record<string, AttributeKind>>;
    readonly synonyms?: readonly SynonymRule[];
    readonly facets?: Readonly<Record<string, FacetConfig>>;
    readonly rules?: readonly Rule[];
    /**
     * Sorts that only make sense inside a filter.
     *
     * A merchandiser's position is an order within one category, so sorting
     * by it across the whole catalog means nothing. A sort named here is
     * honored only when the request also filters on the attribute given, and
     * falls back to relevance otherwise, rather than failing.
     */
    readonly sortScopes?: Readonly<Record<string, string>>;
    /**
     * How often each document was chosen, by id, from whatever the caller
     * collected. A chosen document's score is raised by a bounded amount,
     * so what shoppers pick nudges relevance without ever passing a pin or
     * undoing a bury. Documents not named are left as they are.
     */
    readonly signals?: Readonly<Record<string, number>>;
    readonly limits?: {
        /** The most results one page may hold. Larger requests are clamped. */
        readonly pageSize?: number;
        /** The most results one query may page through. */
        readonly results?: number;
    };
}

/**
 * A condition a result must meet: one value, any of several words, or a
 * number in a range. A word is for a keyword attribute, true or false for a
 * boolean, and a range for a number.
 */
export type Filter =
    | { readonly attribute: string; readonly eq: string | boolean }
    | { readonly attribute: string; readonly in: readonly string[] }
    | {
          readonly attribute: string;
          /** `from` is inclusive and `to` is exclusive, so adjacent ranges never share a value. */
          readonly range: { readonly from?: number; readonly to?: number };
      };

/** One step of an order. */
export interface SortClause {
    /**
     * An attribute name, `relevance` for the match score, or `id` for the order
     * the documents were indexed in.
     */
    readonly by: string;
    readonly direction: 'asc' | 'desc';
}

/** What a shopper asked for, and which page of it. */
export interface SearchRequest {
    readonly query?: string;
    readonly filters?: readonly Filter[];
    /** The first clause orders, and each later one breaks the ties before it. */
    readonly sort?: readonly SortClause[];
    /** One-based. */
    readonly page?: number;
    readonly pageSize?: number;
    /**
     * Treat the last word as something still being typed.
     *
     * Search-as-you-type sends "sho" on the way to "shoes", and a prefix
     * match on the last word is what makes results appear before the word
     * is finished.
     */
    readonly prefixLastTerm?: boolean;
    /** Which facets to count. All configured facets when omitted, none when empty. */
    readonly facets?: readonly string[];
    /** The time, for rules with a window. The engine never reads a clock itself. */
    readonly now?: Date;
}

/**
 * How a query word reached an indexed term: as typed, as a prefix, by one
 * typo or through a synonym.
 */
export type MatchKind = 'exact' | 'prefix' | 'fuzzy' | 'synonym';

/** One reason a document matched, kept so a result can say why it ranked where it did. */
export interface TermMatch {
    /** The typed words this match stands for, normalized. A synonym can stand for several. */
    readonly queryTerm: string;
    /** The indexed term it matched. */
    readonly indexTerm: string;
    readonly field: string;
    readonly kind: MatchKind;
    /** What this one term added to the hit's score, in this field. */
    readonly score: number;
}

/** What the signals did to one result, kept so explain mode can show it. */
export interface SignalEffect {
    /** How often the document was chosen. */
    readonly count: number;
    /** What its score was multiplied by, from one up to the cap. */
    readonly weight: number;
}

/** One result, with why it matched and what rules and signals did to it. */
export interface Hit {
    readonly id: string;
    /** The score after rules and signals. */
    readonly score: number;
    readonly matches: readonly TermMatch[];
    readonly rules: readonly RuleEffect[];
    /** Present when the document was chosen before and its score was raised for it. */
    readonly signal?: SignalEffect;
}

/**
 * Which pass produced the results.
 *
 * Exact matching runs first. Only when it finds nothing does the fuzzy pass
 * run, allowing one typo per word. A result page says which it was, so a
 * shopper can be told their query was corrected. `all` means there was no
 * query, so the results are whatever the filters left, and `none` means the
 * query matched nothing that passes the filters.
 */
export type MatchMode = 'exact' | 'fuzzy' | 'all' | 'none';

/** One page of results, where it sits among them all, and the facets beside it. */
export interface SearchResult {
    readonly hits: readonly Hit[];
    /** Matching documents in all, before the per-query limit. */
    readonly total: number;
    readonly page: number;
    /** The page size used, after clamping to what one page may hold. */
    readonly pageSize: number;
    /** The pages that can be reached, within the per-query limit. */
    readonly totalPages: number;
    readonly mode: MatchMode;
    /** The sort actually applied, after any scoped sort fell back. */
    readonly sort: readonly SortClause[];
    readonly facets: readonly Facet[];
    readonly rules: {
        readonly applied: readonly string[];
        /**
         * The ids of the rules in `setAside`.
         *
         * @deprecated Each rule's id is in `setAside`, with what the sort set aside of it.
         */
        readonly setAsideBySort: readonly string[];
        /** The same rules, each with what the sort set aside of it. */
        readonly setAside: readonly SetAside[];
    };
}

/**
 * A rule a sort set aside, and how many of its pins, boosts and buries gave
 * way. Under a sort scoped to the rule's own filter its pins hold, so only
 * its boosts and buries are counted. Its hides always hold.
 */
export interface SetAside {
    readonly ruleId: string;
    /** The rule's name, when it has one. */
    readonly name?: string;
    readonly pins: number;
    readonly boosts: number;
    readonly buries: number;
}

/**
 * What a page can offer instead of nothing, when a search found nothing.
 *
 * Each part is computed from the request alone, so the engine stays pure.
 * A correction and a shorter phrase are present only when they would find
 * something.
 */
export interface Recovery {
    /**
     * The phrase with each word nothing matched replaced by the most used
     * indexed word within two typos of it that finds something.
     */
    readonly correction?: string;
    /** The phrase with some of the shopper's words left out, and what it finds. */
    readonly relaxed?: {
        readonly query: string;
        /** The words left out, as the shopper typed them. */
        readonly dropped: readonly string[];
        readonly total: number;
    };
    /**
     * How many documents the same phrase finds without the request's own
     * filters, the fixed ones kept. Zero when the request had none.
     */
    readonly foundWithoutFilters: number;
}

/**
 * What kind of mistake an `EngineError` reports: a name the config does not
 * have, a filter or document value its attribute's kind cannot take, or a rule
 * that could never do what it says.
 */
export type EngineErrorCode =
    'unknown_attribute' | 'wrong_attribute_kind' | 'unknown_facet' | 'invalid_rule';

/**
 * A request the engine cannot carry out.
 *
 * Thrown for a request that names what the config does not, or asks an
 * attribute for what its kind cannot take, and for a document or a rule the
 * engine cannot index. Each is a mistake in the caller rather than a search
 * with no results. A caller fronting an API turns this into a validation
 * error for the client.
 */
export class EngineError extends Error {
    constructor(
        readonly code: EngineErrorCode,
        message: string
    ) {
        super(message);
        this.name = 'EngineError';
    }
}
