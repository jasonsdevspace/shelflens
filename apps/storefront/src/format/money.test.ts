import { describe, expect, it } from 'vitest';

import { formatMoney, formatPriceRange, priceBandText } from './money.js';

describe('money', () => {
    it('is formatted for the currency it carries and the locale it is given', () => {
        expect(formatMoney({ amount: 1250, currency: 'USD' }, 'en-US')).toBe('$12.50');
        expect(formatMoney({ amount: 1250, currency: 'EUR' }, 'de-DE')).toBe('12,50 €');
        // The amount is in the currency's own minor unit, which for yen is the yen.
        expect(formatMoney({ amount: 1250, currency: 'JPY' }, 'ja-JP')).toBe('￥1,250');
        expect(formatMoney({ amount: 12_345, currency: 'KWD' }, 'en-US')).toContain('12.345');
        expect(formatMoney({ amount: 9900, currency: 'USD' }, 'en-US')).toBe('$99');
    });

    it('is a range only when the variants differ', () => {
        const low = { amount: 1000, currency: 'USD' };
        const high = { amount: 2550, currency: 'USD' };
        expect(formatPriceRange(low, high, 'en-US')).toBe('$10 to $25.50');
        expect(formatPriceRange(low, { ...low }, 'en-US')).toBe('$10');
        expect(formatPriceRange(low, high, 'en-GB')).toBe('US$10 to US$25.50');
    });

    it('says a band by what bounds it', () => {
        expect(priceBandText({ to: 5000 }, 'USD', 'en-US')).toBe('Under $50');
        expect(priceBandText({ from: 5000, to: 10_000 }, 'USD', 'en-US')).toBe('$50 to $100');
        expect(priceBandText({ from: 10_000 }, 'USD', 'en-US')).toBe('$100 and up');
        expect(priceBandText({}, 'USD', 'en-US')).toBe('Any price');
        expect(priceBandText({ to: 5000 }, 'EUR', 'de-DE')).toBe('Under 50\u00a0€');
    });
});
