import { describe, expect, it } from 'vitest';

import { distinctBands } from './Facets.jsx';

describe('the rating bands', () => {
    const bands = [
        { from: 4, count: 183 },
        { from: 3, count: 360 },
        { from: 2, count: 557 },
        { from: 1, count: 557 },
    ];

    it('leave out a looser band that finds no more than the one before it', () => {
        expect(distinctBands(bands, undefined).map((band) => band.from)).toEqual([4, 3, 2]);
    });

    it('keep a band that adds nothing when it is the one chosen, so it shows as chosen', () => {
        expect(distinctBands(bands, 1).map((band) => band.from)).toEqual([4, 3, 2, 1]);
    });

    it('keep the strictest band whatever it counts', () => {
        expect(distinctBands([{ from: 4, count: 0 }], undefined)).toHaveLength(1);
    });
});
