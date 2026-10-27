import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';

import { createEngine, type Engine, type SearchResult } from '@jasonsdevspace/shelflens';
import { generateCatalog } from '@shelflens/catalog';

import { storeConfig, toDocuments } from './documents.js';
import { searchStore, type StoreSearchRequest } from './store.js';

/**
 * The engine benchmark.
 *
 * The demo indexes two thousand products, which hides every cost. This
 * indexes far more, so the price of building the index, of a facet count
 * over a wide query, and of a fuzzy pass that checks every term is known
 * rather than guessed. Absolute numbers depend on the machine, so each run
 * records what it ran on.
 */

export interface BenchOptions {
    readonly products: number;
    readonly seed: number;
    /** Measured runs per query, after an unmeasured warm-up. */
    readonly iterations: number;
}

export interface QueryTiming {
    readonly name: string;
    readonly request: Omit<StoreSearchRequest, 'group'>;
    readonly total: number;
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
}

export interface BenchResult {
    readonly catalog: {
        readonly products: number;
        readonly seed: number;
        readonly jsonBytes: number;
        readonly gzipBytes: number;
    };
    readonly index: {
        readonly terms: number;
        readonly buildMs: number;
        readonly documentsPerSecond: number;
        readonly heapMb: number;
    };
    readonly queries: readonly QueryTiming[];
}

/** The shapes of request a storefront sends, from cheapest to most demanding. */
export const BENCH_QUERIES: readonly {
    name: string;
    request: Omit<StoreSearchRequest, 'group'>;
}[] = [
    { name: 'search as you type, two letters', request: { query: 'sh', prefixLastTerm: true } },
    { name: 'one common word', request: { query: 'jacket' } },
    { name: 'two words', request: { query: 'navy blue hoodie' } },
    { name: 'a synonym', request: { query: 'trainers' } },
    { name: 'a typo, so the fuzzy pass runs', request: { query: 'sneakr' } },
    {
        name: 'browse a category by position',
        request: {
            filters: [{ attribute: 'category', eq: 'shoes' }],
            sort: [{ by: 'position', direction: 'asc' }],
        },
    },
    {
        name: 'a word with two filters',
        request: {
            query: 'boot',
            filters: [
                { attribute: 'brand', eq: 'Northwind' },
                { attribute: 'price', range: { from: 10000, to: 20000 } },
            ],
        },
    },
    { name: 'everything, page fifty', request: { page: 50 } },
];

const percentile = (sorted: readonly number[], fraction: number): number => {
    const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
    return sorted[Math.max(0, index)] ?? 0;
};

const round = (value: number): number => Number(value.toFixed(2));

const time = (engine: Engine, request: Omit<StoreSearchRequest, 'group'>, iterations: number) => {
    let result: SearchResult | undefined;
    for (let i = 0; i < 3; i += 1) result = searchStore(engine, { group: 'guest', ...request });
    const samples: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
        const started = performance.now();
        result = searchStore(engine, { group: 'guest', ...request });
        samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    return {
        total: result?.total ?? 0,
        p50: round(percentile(samples, 0.5)),
        p95: round(percentile(samples, 0.95)),
        p99: round(percentile(samples, 0.99)),
    };
};

export const runBench = ({ products, seed, iterations }: BenchOptions): BenchResult => {
    const catalog = generateCatalog({ seed, products });
    const json = JSON.stringify(catalog);
    const documents = toDocuments(catalog);

    // Collected before and after, when the runtime allows it, so the heap
    // figure is the index and not the garbage left by generating the catalog.
    const collect = (globalThis as { gc?: () => void }).gc;
    collect?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const started = performance.now();
    const engine = createEngine(documents, storeConfig());
    const buildMs = performance.now() - started;
    collect?.();
    const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;

    return {
        catalog: {
            products,
            seed,
            jsonBytes: json.length,
            gzipBytes: gzipSync(json).length,
        },
        index: {
            terms: engine.terms,
            buildMs: Math.round(buildMs),
            documentsPerSecond: Math.round(products / (buildMs / 1000)),
            heapMb: Math.round(heapMb),
        },
        queries: BENCH_QUERIES.map(({ name, request }) => ({
            name,
            request,
            ...time(engine, request, iterations),
        })),
    };
};
