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

/** The README's gotchas table: each row's gotcha, and the test files it names, in order. */
const tableRows = (): { gotcha: string; tests: string[] }[] => {
    const lines = readFileSync(new URL('README.md', root), 'utf8').split('\n');
    const heading = lines.indexOf('## The gotchas, and the test behind each');
    if (heading === -1) throw new Error('the README has no gotchas heading');
    const first = lines.findIndex((line, i) => i > heading && line.startsWith('|'));
    if (first === -1) throw new Error('the gotchas heading has no table under it');
    const after = lines.findIndex((line, i) => i > first && !line.startsWith('|'));
    return lines.slice(first + 2, after === -1 ? lines.length : after).map((row) => {
        // A pipe in a cell is escaped, so only a bare one ends a cell.
        const cells = row.split(/(?<!\\)\|/).map((cell) => cell.trim());
        if (cells.length !== 4) throw new Error(`a gotchas row is not two cells: ${row}`);
        return {
            gotcha: cells[1] ?? '',
            tests: [...(cells[2] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ''),
        };
    });
};

/** The one gotcha with no stop, since its page is not the store's. */
const WIDGET = 'The widget keeps its look';

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

    it('points every stop the page can reach at something for Try it to focus', () => {
        for (const stop of STOPS) {
            expect(stop.focus !== undefined, stop.id).toBe(stop.to !== undefined);
        }
    });

    it('gives each stop a row in the README table naming the same tests, in the same order', () => {
        const rows = tableRows();
        expect(rows.filter((row) => row.gotcha.startsWith(WIDGET))).toHaveLength(1);
        expect(
            rows.filter((row) => !row.gotcha.startsWith(WIDGET)).map((row) => row.tests)
        ).toEqual(STOPS.map((stop) => [...stop.tests]));
    });
});
