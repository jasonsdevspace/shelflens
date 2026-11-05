import { describe, expect, it } from 'vitest';

import { parseSizeRecord } from './sizes.js';

const timing = { samples: 1, p50Ms: 1, p95Ms: 2, maxMs: 3 };
const result = {
    products: 2000,
    catalogBytes: 10,
    parseMs: 1,
    buildMs: 2,
    suggest: timing,
    search: timing,
};

describe('a size record', () => {
    it('reads each measured size', () => {
        expect(parseSizeRecord({ results: [result] })).toEqual([result]);
    });

    it('refuses a renamed field, naming the field', () => {
        const { buildMs: _, ...renamed } = result;
        expect(() => parseSizeRecord({ results: [{ ...renamed, build: 2 }] })).toThrow(
            'result 1 has no number for buildMs'
        );
    });

    it("refuses a timing without its p95, naming the size's timing", () => {
        const { p95Ms: _, ...short } = timing;
        expect(() => parseSizeRecord({ results: [{ ...result, suggest: short }] })).toThrow(
            "result 1's suggest has no number for p95Ms"
        );
    });

    it('refuses a record with no list of results', () => {
        expect(() => parseSizeRecord({ result: [] })).toThrow(
            'the record holds no list of results'
        );
    });
});
