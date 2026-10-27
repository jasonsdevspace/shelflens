import { createStore, createStoreApi, type StoreApi, viewerFromHeader } from '@shelflens/api';
import { type Catalog, generateCatalog } from '@shelflens/catalog';
import { GOLDEN_CASES } from '@shelflens/search';

/**
 * What the popover waits for.
 *
 * Results must be visible within 150 ms of the last keystroke, and the
 * input waits 100 ms before asking, so the API has 50 ms for a suggestion.
 * This measures the two things a shopper pays for in the demo: the one-time
 * cost of the worker building the store from the catalog it downloaded, and
 * the per-keystroke cost of a suggestion, measured for every prefix of every
 * golden query since that is what typing them produces. The full first page
 * with its facets is measured as well, since Enter asks for that.
 */

export interface Timing {
    readonly samples: number;
    readonly p50Ms: number;
    readonly p95Ms: number;
    readonly maxMs: number;
}

export interface PopoverBench {
    readonly products: number;
    readonly catalogBytes: number;
    /** Reading the catalog JSON, as the worker does once per install. */
    readonly parseMs: number;
    /** Building the index and the completions from it. */
    readonly buildMs: number;
    readonly suggest: Timing;
    readonly search: Timing;
}

export interface PopoverBenchOptions {
    readonly products?: number;
    readonly seed?: number;
    /** How many times each phrase is timed. */
    readonly iterations?: number;
}

const SUGGEST = `query Suggest($phrase: String!) {
    suggest(phrase: $phrase, limit: 5) {
        queries
        products { product { sku name colors brand { name } price { min { amount currency } max { amount currency } } } }
    }
}`;

const SEARCH = `query Search($phrase: String!) {
    search(input: { phrase: $phrase, pageSize: 20 }) {
        total matching
        items { product { sku name colors brand { name } price { min { amount currency } max { amount currency } } } }
        facets { name attribute
            ... on ValueFacet { buckets { value count } }
            ... on RangeFacet { buckets { from to count } }
            ... on StatsFacet { min max count } }
    }
}`;

/** Every prefix a shopper types on the way to a golden query, from the second character on. */
export const typedPrefixes = (phrases: readonly string[]): readonly string[] =>
    phrases.flatMap((phrase) =>
        Array.from({ length: phrase.length - 1 }, (_, i) => phrase.slice(0, i + 2))
    );

const percentile = (sorted: readonly number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;

const timing = (durations: number[]): Timing => {
    const sorted = [...durations].sort((a, b) => a - b);
    return {
        samples: sorted.length,
        p50Ms: round(percentile(sorted, 0.5)),
        p95Ms: round(percentile(sorted, 0.95)),
        maxMs: round(sorted.at(-1) ?? 0),
    };
};

const round = (ms: number): number => Math.round(ms * 100) / 100;

const timeEach = async (
    api: StoreApi,
    query: string,
    phrases: readonly string[],
    iterations: number
): Promise<Timing> => {
    const guest = viewerFromHeader(undefined);
    const durations: number[] = [];
    for (let round = 0; round < iterations; round += 1) {
        for (const phrase of phrases) {
            const started = performance.now();
            const response = await api.run({ query, variables: { phrase } }, guest);
            durations.push(performance.now() - started);
            if (response.errors) throw new Error(JSON.stringify(response.errors));
        }
    }
    return timing(durations);
};

export const runPopoverBench = async ({
    products = 2000,
    seed = 20261027,
    iterations = 20,
}: PopoverBenchOptions = {}): Promise<PopoverBench> => {
    const json = JSON.stringify(generateCatalog({ seed, products }));

    const parseStarted = performance.now();
    const catalog = JSON.parse(json) as Catalog;
    const parseMs = performance.now() - parseStarted;

    const buildStarted = performance.now();
    const api = createStoreApi(createStore({ catalog }));
    const buildMs = performance.now() - buildStarted;

    const phrases = GOLDEN_CASES.map((golden) => golden.query);
    return {
        products,
        catalogBytes: Buffer.byteLength(json),
        parseMs: round(parseMs),
        buildMs: round(buildMs),
        suggest: await timeEach(api, SUGGEST, typedPrefixes(phrases), iterations),
        search: await timeEach(api, SEARCH, phrases, iterations),
    };
};
