import { describe, expect, it } from 'vitest';

import { formatMoney, formatPriceRange } from './money.js';

describe('money', () => {
    it('is formatted for the currency it carries and the locale it is given', () => {
        expect(formatMoney({ amount: 1250, currency: 'USD' })).toBe('$12.50');
        expect(formatMoney({ amount: 1250, currency: 'EUR' }, 'de-DE')).toBe('12,50 €');
        expect(formatMoney({ amount: 125_000, currency: 'JPY' }, 'ja-JP')).toBe('￥1,250');
        expect(formatMoney({ amount: 9900, currency: 'USD' })).toBe('$99');
    });

    it('is a range only when the variants differ', () => {
        const low = { amount: 1000, currency: 'USD' };
        const high = { amount: 2550, currency: 'USD' };
        expect(formatPriceRange(low, high)).toBe('$10 to $25.50');
        expect(formatPriceRange(low, { ...low })).toBe('$10');
        expect(formatPriceRange(low, high, 'en-GB')).toBe('US$10 to US$25.50');
    });
});
