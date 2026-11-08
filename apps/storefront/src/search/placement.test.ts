import { describe, expect, it } from 'vitest';

import { GAIN_PX, opensAbove } from './placement.js';

describe('which way the list opens', () => {
    it('opens below wherever the list fits there, however much room is above', () => {
        expect(opensAbove({ below: 300, above: 900, needs: 300, open: 'below' })).toBe(false);
    });

    it('opens above a box set low, where the list would not fit below and more of it shows above', () => {
        expect(opensAbove({ below: 256, above: 510, needs: 359, open: 'below' })).toBe(true);
    });

    it('stays below for a gain too small to be worth covering the page above', () => {
        expect(opensAbove({ below: 300, above: 301, needs: 600, open: 'below' })).toBe(false);
        expect(
            opensAbove({ below: 300, above: 300 + GAIN_PX - 1, needs: 600, open: 'below' })
        ).toBe(false);
        expect(opensAbove({ below: 300, above: 300 + GAIN_PX, needs: 600, open: 'below' })).toBe(
            true
        );
    });

    it('counts only the room the list would use above, not room it leaves empty', () => {
        expect(opensAbove({ below: 300, above: 900, needs: 310, open: 'below' })).toBe(false);
    });

    it('stays above while the list narrows to what would fit below, so it does not jump as a shopper types', () => {
        expect(opensAbove({ below: 256, above: 510, needs: 120, open: 'above' })).toBe(true);
    });

    it('goes back below once the room above is the smaller and the list does not fit there', () => {
        expect(opensAbove({ below: 500, above: 200, needs: 359, open: 'above' })).toBe(false);
    });
});
