import type { Index } from './index-builder.js';
import {
    type AttributeValue,
    type EngineConfig,
    EngineError,
    type Facet,
    type FacetConfig,
    type ValueBucket,
} from './types.js';

/**
 * Facets: the counts beside each filter a shopper could add next.
 *
 * Each facet is counted over the documents that match the query and every
 * filter except the ones on its own attribute. That is what keeps "Blue"
 * from dropping to zero the moment "Red" is selected in the same facet:
 * the color facet ignores the color filter, so it still says how many of
 * each color there would be. A filter on a different attribute, such as a
 * brand, does narrow it, which is what a shopper expects.
 */

const isList = (value: AttributeValue | undefined): value is readonly string[] =>
    Array.isArray(value);

/** The most values one facet reports. Past this a facet is a list, not a filter. */
const DEFAULT_MAX_BUCKETS = 100;

export const checkFacets = (config: EngineConfig, names: readonly string[]): void => {
    for (const name of names) {
        if (!config.facets?.[name]) {
            throw new EngineError('unknown_facet', `no facet named ${name}`);
        }
    }
};

/** Documents to count: a document array, and which of them pass. */
export interface Counted {
    readonly docs: ArrayLike<number>;
    /** A flag per position in `docs`: one when that document passes. */
    readonly passes: Uint8Array;
}

const keywordFacet = (
    name: string,
    facet: Extract<FacetConfig, { kind: 'keyword' }>,
    counted: Counted,
    index: Index
): Facet => {
    const counts = new Map<string, number>();
    const count = (value: string) => counts.set(value, (counts.get(value) ?? 0) + 1);
    const column = index.columns.get(facet.attribute);
    for (let i = 0; i < counted.docs.length; i += 1) {
        if (counted.passes[i] !== 1) continue;
        const value = column?.[counted.docs[i] ?? 0];
        if (typeof value === 'string') {
            count(value);
        } else if (isList(value)) {
            // A document with several values counts once for each, and
            // never twice for the same one. The lists are short, so a scan
            // back is cheaper than a Set per document.
            value.forEach((item, j) => {
                if (value.indexOf(item) === j) count(item);
            });
        }
    }
    const buckets: ValueBucket[] = [...counts]
        .map(([value, count]) => ({ kind: 'value' as const, value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, facet.maxBuckets ?? DEFAULT_MAX_BUCKETS);
    return { name, attribute: facet.attribute, kind: 'keyword', buckets };
};

const rangeFacet = (
    name: string,
    facet: Extract<FacetConfig, { kind: 'range' }>,
    counted: Counted,
    index: Index
): Facet => {
    const counts = facet.ranges.map(() => 0);
    const column = index.columns.get(facet.attribute);
    for (let i = 0; i < counted.docs.length; i += 1) {
        if (counted.passes[i] !== 1) continue;
        const value = column?.[counted.docs[i] ?? 0];
        if (typeof value !== 'number') continue;
        facet.ranges.forEach((range, r) => {
            const above = range.from === undefined || value >= range.from;
            const below = range.to === undefined || value < range.to;
            if (above && below) counts[r] = (counts[r] ?? 0) + 1;
        });
    }
    return {
        name,
        attribute: facet.attribute,
        kind: 'range',
        buckets: facet.ranges.map((range, r) => ({
            kind: 'range' as const,
            ...(range.from !== undefined && { from: range.from }),
            ...(range.to !== undefined && { to: range.to }),
            count: counts[r] ?? 0,
        })),
    };
};

const statsFacet = (
    name: string,
    facet: Extract<FacetConfig, { kind: 'stats' }>,
    counted: Counted,
    index: Index
): Facet => {
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    const column = index.columns.get(facet.attribute);
    for (let i = 0; i < counted.docs.length; i += 1) {
        if (counted.passes[i] !== 1) continue;
        const value = column?.[counted.docs[i] ?? 0];
        if (typeof value !== 'number') continue;
        count += 1;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    return {
        name,
        attribute: facet.attribute,
        kind: 'stats',
        count,
        ...(count > 0 && { min, max }),
    };
};

export const computeFacet = (
    name: string,
    facet: FacetConfig,
    counted: Counted,
    index: Index
): Facet => {
    switch (facet.kind) {
        case 'keyword':
            return keywordFacet(name, facet, counted, index);
        case 'range':
            return rangeFacet(name, facet, counted, index);
        case 'stats':
            return statsFacet(name, facet, counted, index);
    }
};
