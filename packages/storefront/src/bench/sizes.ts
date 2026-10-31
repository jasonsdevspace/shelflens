import { type PopoverBench, runPopoverBench } from './bench.js';
import { round } from './record.js';

/**
 * How large a catalog the popover can carry.
 *
 * The demo's catalog is two thousand products, and the engine's record goes
 * to a hundred thousand, where a short query no longer fits the popover's
 * budget. A visitor's own catalog sits somewhere between, so this measures
 * the sizes in between and says the largest one that fits.
 *
 * A suggestion has 50 ms, the popover's budget. A visitor also waits once,
 * after loading a file, for their store to start, and that wait is held to
 * two seconds so loading still feels like one step. These numbers come from
 * a laptop, and a visitor may be on a phone, so both budgets are held after
 * a fourfold slowdown, the one Lighthouse applies to the processor when it
 * audits for mobile, with answers held at the 95th percentile.
 */
export const SIZES = [2000, 5000, 10_000, 25_000] as const;
export const SUGGEST_BUDGET_MS = 50;
export const START_BUDGET_MS = 2000;
export const PHONE_SLOWDOWN = 4;

/** Reading the catalog and building the store, rounded as the record shows it. */
export const startMs = (result: SizeResult): number => round(result.parseMs + result.buildMs);

export type SizeResult = Pick<
    PopoverBench,
    'products' | 'catalogBytes' | 'parseMs' | 'buildMs' | 'suggest' | 'search'
>;

/** Whether a measured size answers within the budget on a phone. */
export const fitsOnAPhone = (result: SizeResult): boolean =>
    result.suggest.p95Ms * PHONE_SLOWDOWN <= SUGGEST_BUDGET_MS &&
    result.search.p95Ms * PHONE_SLOWDOWN <= SUGGEST_BUDGET_MS &&
    startMs(result) * PHONE_SLOWDOWN <= START_BUDGET_MS;

/**
 * The largest measured size that fits, and every smaller one has to fit too,
 * so a lucky run at one size cannot lift the cap past a slower one below it.
 */
export const supportedCap = (results: readonly SizeResult[]): number => {
    let cap = 0;
    for (const result of [...results].sort((a, b) => a.products - b.products)) {
        if (!fitsOnAPhone(result)) break;
        cap = result.products;
    }
    return cap;
};

/**
 * Measures each size in turn. With the collector exposed, as `bench:sizes`
 * runs it, the heap left by one size is collected before the next is built,
 * so a larger size's start does not pay for a smaller one's garbage.
 */
export const runSizes = async (iterations: number): Promise<SizeResult[]> => {
    const results: SizeResult[] = [];
    for (const products of SIZES) {
        (globalThis as { gc?: () => void }).gc?.();
        results.push(await runPopoverBench({ products, iterations }));
    }
    return results;
};
