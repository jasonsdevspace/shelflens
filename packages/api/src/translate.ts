import type { Filter, Hit, MatchKind, MatchMode, SortClause } from '@jasonsdevspace/shelflens';
import { GraphQLError } from 'graphql';

import type {
    FilterAttribute,
    FilterInput,
    Matching,
    MatchRoute,
    SortClause as SortClauseModel,
    SortField,
    SortInput,
} from './generated/schema.js';

/**
 * The API's words and the engine's words, translated in one place.
 *
 * The schema names things as a shopper or a storefront developer would. The
 * engine names them as an index does. Neither side knows the other's names.
 */

const ATTRIBUTES: Readonly<Record<FilterAttribute, string>> = {
    CATEGORY: 'category',
    BRAND: 'brand',
    COLOR: 'color',
    SIZE: 'size',
    MATERIAL: 'material',
    PRICE: 'price',
    RATING: 'rating',
    IN_STOCK: 'inStock',
};

const ATTRIBUTE_NAMES = new Map(
    Object.entries(ATTRIBUTES).map(([enumValue, name]) => [name, enumValue as FilterAttribute])
);

export const attributeName = (attribute: FilterAttribute): string => ATTRIBUTES[attribute];

/** The schema's name for an engine attribute. */
export const attributeEnum = (name: string): FilterAttribute | undefined =>
    ATTRIBUTE_NAMES.get(name);

const SORT_FIELDS: Readonly<Record<SortField, string>> = {
    RELEVANCE: 'relevance',
    PRICE: 'price',
    RATING: 'rating',
    POSITION: 'position',
    ADDED: 'createdAt',
    CATALOG: 'id',
};

const SORT_FIELD_NAMES = new Map(
    Object.entries(SORT_FIELDS).map(([enumValue, name]) => [name, enumValue as SortField])
);

/** A request's mistake, reported as one. */
export const badInput = (message: string): GraphQLError =>
    new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });

/** An input field the client gave, as opposed to one left out or set to null. */
const isSet = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export const toFilter = (input: FilterInput): Filter => {
    const attribute = attributeName(input.attribute);
    const { match } = input;
    if (match.range) {
        if (input.attribute !== 'PRICE' && input.attribute !== 'RATING') {
            throw badInput(`${input.attribute} takes eq or in, not a range`);
        }
        return {
            attribute,
            range: {
                ...(isSet(match.range.from) && { from: match.range.from }),
                ...(isSet(match.range.to) && { to: match.range.to }),
            },
        };
    }
    if (input.attribute === 'IN_STOCK') {
        if (match.eq !== 'true' && match.eq !== 'false') {
            throw badInput('IN_STOCK takes eq "true" or eq "false"');
        }
        return { attribute, eq: match.eq === 'true' };
    }
    if (isSet(match.eq)) return { attribute, eq: match.eq };
    if (isSet(match.in)) return { attribute, in: match.in };
    throw badInput(`a filter on ${input.attribute} needs eq, in or range`);
};

export const toSort = (input: SortInput): SortClause => ({
    by: SORT_FIELDS[input.by],
    direction: input.direction === 'DESC' ? 'desc' : 'asc',
});

export const fromSort = (clause: SortClause): SortClauseModel => ({
    by: SORT_FIELD_NAMES.get(clause.by) ?? 'RELEVANCE',
    direction: clause.direction === 'desc' ? 'DESC' : 'ASC',
});

const MATCHING: Readonly<Record<MatchMode, Matching>> = {
    exact: 'EXACT',
    fuzzy: 'CORRECTED',
    all: 'ALL',
    none: 'NONE',
};

export const fromMode = (mode: MatchMode): Matching => MATCHING[mode];

const ROUTES: Readonly<Record<MatchKind, MatchRoute>> = {
    exact: 'EXACT',
    prefix: 'PREFIX',
    synonym: 'SYNONYM',
    fuzzy: 'CORRECTED',
};

export const fromKind = (kind: MatchKind): MatchRoute => ROUTES[kind];

/** The schema's view of why a hit ranked where it did. */
export const explanationOf = (hit: Hit) => ({
    matches: hit.matches.map((match) => ({
        typed: match.queryTerm,
        matched: match.indexTerm,
        field: match.field,
        route: fromKind(match.kind),
        score: match.score,
    })),
    rules: hit.rules.map((effect) => ({
        ruleId: effect.ruleId,
        action: effect.action.toUpperCase() as 'PIN' | 'BOOST' | 'BURY',
        weight: effect.weight ?? null,
    })),
});
