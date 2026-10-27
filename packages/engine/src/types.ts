/**
 * The engine's vocabulary.
 *
 * The engine knows nothing about products. It indexes documents, each with
 * some searchable text and some attributes to filter, facet and sort by. A
 * catalog is turned into documents by whoever owns the catalog, which is
 * what keeps this package free of any one store's shape.
 */

export type AttributeValue = string | number | boolean | readonly string[];

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

export interface EngineConfig {
    readonly fields: Readonly<Record<string, TextField>>;
    readonly attributes: Readonly<Record<string, AttributeKind>>;
    readonly synonyms?: readonly SynonymRule[];
    /**
     * Sorts that only make sense inside a filter.
     *
     * A merchandiser's position is an order within one category, so sorting
     * by it across the whole catalog means nothing. A sort named here is
     * honored only when the request also filters on the attribute given, and
     * falls back to relevance otherwise, rather than failing.
     */
    readonly sortScopes?: Readonly<Record<string, string>>;
    readonly limits?: {
        /** The most results one page may hold. Larger requests are clamped. */
        readonly pageSize?: number;
        /** The most results one query may page through. */
        readonly results?: number;
    };
}

export type Filter =
    | { readonly attribute: string; readonly eq: string | boolean }
    | { readonly attribute: string; readonly in: readonly string[] }
    /** `from` is inclusive and `to` is exclusive, so adjacent ranges never share a value. */
    | {
          readonly attribute: string;
          readonly range: { readonly from?: number; readonly to?: number };
      };

export interface SortClause {
    /** An attribute name, or `relevance` for the match score. */
    readonly by: string;
    readonly direction: 'asc' | 'desc';
}

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
}

export type MatchKind = 'exact' | 'prefix' | 'fuzzy' | 'synonym';

/** One reason a document matched, kept so a result can say why it ranked where it did. */
export interface TermMatch {
    readonly queryTerm: string;
    readonly indexTerm: string;
    readonly field: string;
    readonly kind: MatchKind;
    readonly score: number;
}

export interface Hit {
    readonly id: string;
    readonly score: number;
    readonly matches: readonly TermMatch[];
}

/**
 * Which pass produced the results.
 *
 * Exact matching runs first. Only when it finds nothing does the fuzzy pass
 * run, allowing one typo per word. A result page says which it was, so a
 * shopper can be told their query was corrected.
 */
export type MatchMode = 'exact' | 'fuzzy' | 'all' | 'none';

export interface SearchResult {
    readonly hits: readonly Hit[];
    /** Matching documents in all, before the per-query limit. */
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
    readonly mode: MatchMode;
    /** The sort actually applied, after any scoped sort fell back. */
    readonly sort: readonly SortClause[];
}

/**
 * A request the engine cannot carry out.
 *
 * Thrown for a request that names an attribute the config does not, which
 * is a mistake in the caller rather than a search with no results. A caller
 * fronting an API turns this into a validation error for the client.
 */
export class EngineError extends Error {
    constructor(
        readonly code: 'unknown_attribute' | 'wrong_attribute_kind' | 'unknown_field',
        message: string
    ) {
        super(message);
        this.name = 'EngineError';
    }
}
