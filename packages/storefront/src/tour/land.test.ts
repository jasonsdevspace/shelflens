import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_STATE, serializeSearchState } from '../app/url.js';
import { land } from './land.js';

/*
 * Where "Try it" puts focus: on what the stop points at once the page has
 * settled, on the heading when that is out of sight, and nowhere when the
 * visitor has put focus somewhere first.
 */

const to = { ...EMPTY_STATE, phrase: 'jacket' };

/** The page as "Try it" leaves it: at the stop's address, with the link that was pressed focused. */
const page = (markup: string) => {
    window.history.replaceState(null, '', `/${serializeSearchState(to)}`);
    document.body.innerHTML = `<a href="#" id="try">Try it</a>${markup}`;
    document.getElementById('try')?.focus();
};

const frames = (count: number) => vi.advanceTimersByTime(count * 20);

describe('landing on a stop', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance', 'setTimeout'] });
    });
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('focuses what the stop points at once the page has settled, and gives back the tabindex it added', () => {
        page('<h1>Results</h1><div class="set-aside">Set aside</div><button id="other">x</button>');
        land(to, '.set-aside');
        frames(4);
        const target = document.querySelector('.set-aside');
        expect(document.activeElement).toBe(target);
        expect(target).toHaveAttribute('tabindex', '-1');
        document.getElementById('other')?.focus();
        expect(target).not.toHaveAttribute('tabindex');
    });

    it('waits while the page is busy', () => {
        page('<h1>Results</h1><div aria-busy="true"><div class="set-aside">Set aside</div></div>');
        land(to, '.set-aside');
        frames(10);
        expect(document.activeElement?.id).toBe('try');
        document.querySelector('[aria-busy]')?.setAttribute('aria-busy', 'false');
        frames(4);
        expect(document.activeElement).toBe(document.querySelector('.set-aside'));
    });

    it('waits while the address is still the page before', () => {
        page('<h1>Results</h1><div class="set-aside">Set aside</div>');
        window.history.replaceState(null, '', '/?q=boot');
        land(to, '.set-aside');
        frames(10);
        expect(document.activeElement?.id).toBe('try');
    });

    it('lands on the heading when what the stop points at is out of sight', () => {
        page('<h1>Results</h1><div hidden><fieldset data-facet="brand"></fieldset></div>');
        land(to, 'fieldset[data-facet="brand"]');
        frames(4);
        expect(document.activeElement).toBe(document.querySelector('h1'));
    });

    it('never takes focus the visitor has put somewhere while the page loaded', () => {
        page('<h1>Results</h1><div aria-busy="true"></div><input id="box">');
        land(to, 'h1');
        const box = document.getElementById('box');
        box?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        box?.focus();
        document.querySelector('[aria-busy]')?.removeAttribute('aria-busy');
        frames(4);
        expect(document.activeElement?.id).toBe('box');
    });

    it('takes focus from where the page put it itself, as a product does its heading', () => {
        page('<h1 tabindex="-1">Product</h1><h2 id="rail-heading">Most rated</h2>');
        land(to, '#rail-heading');
        document.querySelector<HTMLElement>('h1')?.focus();
        frames(4);
        expect(document.activeElement?.id).toBe('rail-heading');
    });

    it('still lands once the page has taken too long to settle', () => {
        page('<h1>Results</h1><div aria-busy="true"><div class="set-aside">Set aside</div></div>');
        land(to, '.set-aside');
        frames(300);
        expect(document.activeElement).toBe(document.querySelector('.set-aside'));
    });
});
