import { describe, expect, it } from 'vitest';

import { storageFor, storeKindOf } from './storage.js';

describe('what each worker keeps', () => {
    it('serves a visitor’s catalog only when registered for it', () => {
        expect(storeKindOf('https://example.test/shelflens/sw.js')).toBe('demo');
        expect(storeKindOf('https://example.test/shelflens/sw.js?store=try')).toBe('try');
        expect(storeKindOf('https://example.test/shelflens/sw.js?store=other')).toBe('demo');
    });

    it('keeps the demo’s names, so a returning visitor keeps what they saved', () => {
        expect(storageFor('demo')).toEqual({
            answers: 'shelflens-answers',
            events: 'shelflens-events',
            rules: 'shelflens-rules',
        });
    });

    it('gives a visitor’s store names of its own for everything, so nothing reaches the demo', () => {
        const demo = storageFor('demo');
        const visitor = storageFor('try');
        expect(visitor.catalog).toBeDefined();
        for (const name of [demo.answers, demo.events, demo.rules]) {
            expect(Object.values(visitor)).not.toContain(name);
        }
    });
});
