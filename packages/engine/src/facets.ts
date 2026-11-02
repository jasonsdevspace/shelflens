import type { Index, KeywordCodes } from './index-builder.js';
import {
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

/**
 * Counts held between searches, one array per coded attribute, always all
 * zero when no count is running. A search touches only the codes its
 * matches carry, so a narrow query over an attribute with a hundred
 * thousand distinct values costs what its matches cost, not the values.
 */
const scratch = new WeakMap<KeywordCodes, Int32Array>();

/**
 * Counted by code, into one array, rather than by string into a map. The
 * codes hold each document's values once, so a document never counts twice
 * for the same value.
 */
const countCodes = (coded: KeywordCodes, counted: Counted): ValueBucket[] => {
    let counts = scratch.get(coded);
    if (!counts) {
        counts = new Int32Array(coded.values.length);
        scratch.set(coded, counts);
    }
    const touched: number[] = [];
    const { starts, codes } = coded;
    for (let i = 0; i < counted.docs.length; i += 1) {
        if (counted.passes[i] !== 1) continue;
        const doc = counted.docs[i] ?? 0;
        const end = starts[doc + 1] ?? 0;
        for (let k = starts[doc] ?? 0; k < end; k += 1) {
            const code = codes[k] ?? 0;
            if (counts[code] === 0) touched.push(code);
            counts[code] = (counts[code] ?? 0) + 1;
        }
    }
    // Read back and zeroed, so the array is ready for the next count.
    return touched.map((code): ValueBucket => {
        const count = counts[code] ?? 0;
        counts[code] = 0;
        return { kind: 'value', value: coded.values[code] ?? '', count };
    });
};

const keywordFacet = (
    name: string,
    facet: Extract<FacetConfig, { kind: 'keyword' }>,
    counted: Counted,
    index: Index
): Facet => {
    const coded = index.keywords.get(facet.attribute);
    const buckets: ValueBucket[] = coded ? countCodes(coded, counted) : [];
    buckets.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return {
        name,
        attribute: facet.attribute,
        kind: 'keyword',
        buckets: buckets.slice(0, facet.maxBuckets ?? DEFAULT_MAX_BUCKETS),
    };
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
        for (let r = 0; r < facet.ranges.length; r += 1) {
            const { from, to } = facet.ranges[r] ?? {};
            if ((from === undefined || value >= from) && (to === undefined || value < to)) {
                counts[r] = (counts[r] ?? 0) + 1;
            }
        }
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
