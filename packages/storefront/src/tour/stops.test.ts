// @vitest-environment node
import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { EMPTY_STATE, serializeSearchState } from '../app/url.js';
import { STOPS } from './stops.js';

/*
 * The tour names tests. Every one of them has to exist, or the tour is
 * pointing a reviewer at nothing.
 */

const root = new URL('../../../../', import.meta.url);

describe('the tour', () => {
    it('names only tests that exist', () => {
        for (const stop of STOPS) {
            expect(stop.tests.length, stop.id).toBeGreaterThan(0);
            for (const test of stop.tests) {
                expect(existsSync(new URL(test, root)), `${stop.id}: ${test}`).toBe(true);
            }
        }
    });

    it('has a stop for each gotcha, in the order a shopper meets them', () => {
        expect(STOPS.map((stop) => stop.id)).toEqual([
            'stale',
            'debounce',
            'combobox',
            'cache-key',
            'normalization',
            'facets',
            'url',
            'paging',
            'edges',
            'rules',
            'explain',
            'nothing',
            'prices',
            'cold-start',
            'telemetry',
            'errors',
        ]);
    });

    it('links every stop the page can reach, and only those', () => {
        for (const stop of STOPS) {
            if (stop.id === 'errors') {
                expect(stop.to, stop.id).toBeUndefined();
                continue;
            }
            expect(stop.to, stop.id).toBeDefined();
            expect(() => serializeSearchState(stop.to ?? EMPTY_STATE)).not.toThrow();
        }
    });
});
