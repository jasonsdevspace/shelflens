// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runPopoverBench, typedPrefixes } from './bench.js';

/*
 * The popover's budget, enforced.
 *
 * Results are due within 150 ms of the last keystroke and the input waits
 * 100 ms of quiet first, so a suggestion has 50 ms. The demo catalog is
 * small enough that the API answers in a fraction of a millisecond, and
 * this test is what fails if a change to the engine or the resolvers makes
 * it slow.
 *
 * It runs beside every other test on a shared machine, so the single
 * slowest sample is as often a pause of the garbage collector or the
 * scheduler as it is the engine. The budget is held at the 95th
 * percentile, where one such pause cannot reach, and the typical answer is
 * held far below it, at a floor twenty times the measured value, which a
 * regression in the engine crosses long before the budget is in danger.
 * The slowest sample still has to fit the whole 150 ms, since a shopper
 * notices the slow one.
 */
const SUGGEST_BUDGET_MS = 50;
const TYPICAL_FLOOR_MS = 5;
const WHOLE_BUDGET_MS = 150;

describe('the popover budget', () => {
    it('answers suggestions on the demo catalog within their share of the budget', async () => {
        const bench = await runPopoverBench({ products: 2000, iterations: 3 });
        expect(bench.suggest.samples).toBeGreaterThan(100);
        expect(bench.suggest.p50Ms).toBeLessThan(TYPICAL_FLOOR_MS);
        expect(bench.suggest.p95Ms).toBeLessThan(SUGGEST_BUDGET_MS);
        expect(bench.suggest.maxMs).toBeLessThan(WHOLE_BUDGET_MS);
        expect(bench.search.p50Ms).toBeLessThan(TYPICAL_FLOOR_MS);
        expect(bench.search.p95Ms).toBeLessThan(SUGGEST_BUDGET_MS);
    }, 60_000);

    it('types every prefix from the second character on', () => {
        expect(typedPrefixes(['tee', 'ab'])).toEqual(['te', 'tee', 'ab']);
    });
});
