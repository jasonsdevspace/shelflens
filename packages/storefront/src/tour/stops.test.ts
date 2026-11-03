// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { EMPTY_STATE, serializeSearchState } from '../app/url.js';
import { STOPS } from './stops.js';

/*
 * The tour names tests. Every one of them has to exist, or the tour is
 * pointing a reviewer at nothing.
 */

const root = new URL('../../../../', import.meta.url);

/** The README's gotchas table, one list of test files per row, in order. */
const tableTests = (): string[][] => {
    const readme = readFileSync(new URL('README.md', root), 'utf8');
    const start = readme.indexOf('| Gotcha');
    const table = readme.slice(start, readme.indexOf('\n\n', start));
    return table
        .split('\n')
        .slice(2)
        .map((row) => [...row.split('|')[2]!.matchAll(/`([^`]+)`/g)].map((match) => match[1]!));
};

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
            'recent',
            'cache-key',
            'normalization',
            'facets',
            'url',
            'paging',
            'edges',
            'rules',
            'explain',
            'rules-editor',
            'popularity',
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

    it('gives each stop a row in the README table naming the same tests, in the same order', () => {
        // The widget has a row and no stop, since its page is not the store's.
        const rows = tableTests().filter(
            (tests) => !tests.some((test) => test.includes('/widget/'))
        );
        expect(rows).toEqual(STOPS.map((stop) => [...stop.tests]));
    });
});
