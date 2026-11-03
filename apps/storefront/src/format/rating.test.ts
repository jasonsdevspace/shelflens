import { describe, expect, it } from 'vitest';

import { formatAverage, ratingBandText, ratingText } from './rating.js';

describe('a rating in words', () => {
    it('writes the average to one place, as the locale writes a decimal', () => {
        expect(formatAverage(3.7, 'en-US')).toBe('3.7');
        expect(formatAverage(5, 'en-US')).toBe('5.0');
        expect(formatAverage(3.7, 'de-DE')).toBe('3,7');
    });

    it('says the rating as every page does, in the locale', () => {
        expect(ratingText(4.4, 1993, 'en-US')).toBe('4.4 out of 5, from 1,993 ratings');
        expect(ratingText(4.4, 1993, 'de-DE')).toBe('4,4 out of 5, from 1.993 ratings');
        expect(ratingText(5, 1, 'en-US')).toBe('5.0 out of 5, from 1 rating');
    });

    it('says a band in words, in the singular for one star', () => {
        expect(ratingBandText(4, 'en-US')).toBe('4 stars and up');
        expect(ratingBandText(1, 'en-US')).toBe('1 star and up');
    });
});
