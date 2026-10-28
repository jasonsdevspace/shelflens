// @vitest-environment node
import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { serializeSearchState } from '../app/url.js';
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

    it('has a stop for each gotcha, each a page the URL can name', () => {
        const ids = STOPS.map((stop) => stop.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(
            expect.arrayContaining([
                'stale',
                'debounce',
                'cache-key',
                'paging',
                'facets',
                'normalization',
                'url',
                'edges',
                'rules',
                'errors',
                'prices',
                'combobox',
            ])
        );
        for (const stop of STOPS) {
            expect(() => serializeSearchState(stop.to), stop.id).not.toThrow();
        }
    });
});
