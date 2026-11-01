import { describe, expect, it } from 'vitest';

import { memberLine, metaLine } from './lines.js';

const usd = (amount: number) => ({ amount, currency: 'USD' });

describe('the lines under a product name', () => {
    it('leaves out what a catalog does not have, so no dot leads nowhere', () => {
        expect(metaLine({ brand: { name: 'Unbranded' }, material: '', rating: null })).toBe(
            'Unbranded'
        );
        expect(
            metaLine({
                brand: { name: 'Unbranded' },
                material: ' ',
                rating: { average: 4.2, count: 1 },
            })
        ).toBe('Unbranded · 4.2 out of 5, from 1 rating');
        expect(
            metaLine({
                brand: { name: 'Ridgeback' },
                material: 'Wool',
                rating: { average: 4, count: 12 },
            })
        ).toBe('Ridgeback · Wool · 4.0 out of 5, from 12 ratings');
    });

    it('says what a guest pays beside a member price', () => {
        const price = {
            memberPrice: true,
            min: usd(4950),
            max: usd(4950),
            listPrice: { min: usd(5500), max: usd(5500) },
        };
        expect(memberLine(price, 'en-US')).toBe('Member price, $55 for guests');
        expect(memberLine({ ...price, listPrice: null }, 'en-US')).toBe('Member price');
    });
});
