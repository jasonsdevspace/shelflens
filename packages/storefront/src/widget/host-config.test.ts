import { describe, expect, it } from 'vitest';

import { hostConfig, storeOf } from './host-config.js';

describe('a host page’s store', () => {
    it('searches the demo’s catalog unless the page asks for the visitor’s', () => {
        expect(storeOf(undefined)).toBe('demo');
        expect(storeOf('anything')).toBe('demo');
        expect(storeOf('try')).toBe('try');
    });

    it('registers the demo’s worker over the whole site for the demo', () => {
        expect(hostConfig('/shelflens/', 'demo')).toEqual({
            scriptUrl: '/shelflens/sw.js',
            scope: '/shelflens/',
            apiUrl: '/shelflens/graphql',
            storeUrl: '/shelflens/',
        });
    });

    it('registers the worker for try/ under try/, and asks it whether a catalog is loaded', () => {
        expect(hostConfig('/shelflens/', 'try')).toEqual({
            scriptUrl: '/shelflens/sw.js?store=try',
            scope: '/shelflens/try/',
            apiUrl: '/shelflens/try/graphql',
            storeUrl: '/shelflens/try/',
            catalogUrl: '/shelflens/try/catalog',
        });
    });
});
