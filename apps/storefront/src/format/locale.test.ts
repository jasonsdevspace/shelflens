import { describe, expect, it } from 'vitest';

import { safeLocale } from './locale.js';

describe('the locale', () => {
    it('is the one the store names, and the default when it cannot be read', () => {
        expect(safeLocale('de-de')).toBe('de-DE');
        expect(safeLocale('en_US')).toBe('en-US');
        expect(safeLocale('')).toBe('en-US');
        expect(safeLocale(undefined)).toBe('en-US');
    });
});
