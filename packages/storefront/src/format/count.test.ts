// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { count, formatCount } from './count.js';

describe('a count', () => {
    it('groups its digits as the store’s locale does', () => {
        expect(count(10_000, 'product', 'products', 'en-US')).toBe('10,000 products');
        expect(count(10_000, 'product', 'products', 'de-DE')).toBe('10.000 products');
        expect(formatCount(1_234_567)).toBe('1,234,567');
    });

    it('says one in the singular, and nothing else', () => {
        expect(count(1, 'product', 'products')).toBe('1 product');
        expect(count(0, 'product', 'products')).toBe('0 products');
    });
});
