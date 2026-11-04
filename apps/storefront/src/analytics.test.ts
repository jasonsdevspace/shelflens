import { afterEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
vi.mock('@plausible-analytics/tracker', () => ({ init }));

const { startAnalytics, withoutQueries } = await import('./analytics.js');

afterEach(() => {
    init.mockClear();
    vi.unstubAllGlobals();
});

describe('counting visits', () => {
    it('counts the visit under the one site the domain has, links out included', () => {
        expect(startAnalytics(true)).toBe(true);
        expect(init).toHaveBeenCalledWith({
            domain: 'jasonsdevspace.com',
            outboundLinks: true,
            transformRequest: withoutQueries,
            bindToWindow: false,
            logging: false,
        });
    });

    it('counts nothing for a visitor whose browser sends Global Privacy Control', () => {
        vi.stubGlobal('navigator', { globalPrivacyControl: true });
        expect(startAnalytics()).toBe(false);
        expect(init).not.toHaveBeenCalled();
    });

    it('sends no search phrase, from the page or the page before it', () => {
        const sent = withoutQueries({
            n: 'pageview',
            u: 'https://jasonsdevspace.com/shelflens/?q=wool+jacket&sort=price#results',
            d: 'jasonsdevspace.com',
            r: 'https://jasonsdevspace.com/shelflens/?q=jacket',
        });
        expect(sent).toEqual({
            n: 'pageview',
            u: 'https://jasonsdevspace.com/shelflens/',
            d: 'jasonsdevspace.com',
            r: 'https://jasonsdevspace.com/shelflens/',
        });
        expect(JSON.stringify(sent)).not.toContain('jacket');
    });

    it('keeps a visit that came from nowhere as one', () => {
        const sent = withoutQueries({
            n: 'pageview',
            u: 'https://jasonsdevspace.com/',
            d: 'x',
            r: null,
        });
        expect(sent.r).toBeNull();
    });
});
