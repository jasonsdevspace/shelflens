// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runPopoverBench, typedPrefixes } from './bench.js';

/*
 * The popover's budget, enforced.
 *
 * Results are due within 150 ms of the last keystroke and the input waits
 * 100 ms of quiet first, so a suggestion has 50 ms. The demo catalog is
 * small enough that the API answers in a few milliseconds, and this test
 * is what fails if a change to the engine or the resolvers makes it slow.
 * The bound is on the slowest answer, not the typical one, since the
 * shopper notices the slow one.
 */
const SUGGEST_BUDGET_MS = 50;

describe('the popover budget', () => {
    it('answers every suggestion on the demo catalog within its share of the budget', async () => {
        const bench = await runPopoverBench({ products: 2000, iterations: 3 });
        expect(bench.suggest.samples).toBeGreaterThan(100);
        expect(bench.suggest.maxMs).toBeLessThan(SUGGEST_BUDGET_MS);
        expect(bench.search.p95Ms).toBeLessThan(SUGGEST_BUDGET_MS);
    }, 60_000);

    it('types every prefix from the second character on', () => {
        expect(typedPrefixes(['tee', 'ab'])).toEqual(['te', 'tee', 'ab']);
    });
});
