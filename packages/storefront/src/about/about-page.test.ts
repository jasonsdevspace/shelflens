// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
    GITHUB_PROFILE_URL,
    LICENSE_URL,
    PORTFOLIO_URL,
    PORTFOLIO_WORK_URL,
    REPO_URL,
} from '../app/Portfolio.jsx';
import { STOPS } from '../tour/stops.js';

/*
 * The explainer, the README's two minutes and the tour tell one story.
 * The README's steps are links into the live demo, and each of those
 * states is a link on the explainer too. The stop count the explainer
 * names is the tour's.
 */

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const DEMO = 'https://jasonsdevspace.com/shelflens/';

describe('the explainer', () => {
    const page = read('packages/storefront/about/index.html');
    const readme = read('README.md');

    it('links to every state the README’s two minutes link to', () => {
        const twoMinutes = readme.slice(
            readme.indexOf('## Two minutes with the demo'),
            readme.indexOf('## The gotchas')
        );
        const states = [
            ...twoMinutes.matchAll(/\]\((https:\/\/jasonsdevspace\.com\/shelflens\/[^)]*)\)/g),
        ]
            .map((match) => match[1] ?? '')
            .map((url) => url.slice(DEMO.length))
            // The README points at the explainer too, which is not a state of the store.
            .filter((state) => !state.startsWith('about'));
        expect(states.length).toBeGreaterThan(3);
        for (const state of states) {
            const relative = `../${state}`.replaceAll('&', '&amp;');
            expect(page, state).toContain(`href="${relative}"`);
        }
    });

    it('counts the tour’s stops in words', () => {
        const words = [
            '',
            'one',
            'two',
            'three',
            'four',
            'five',
            'six',
            'seven',
            'eight',
            'nine',
            'ten',
            'eleven',
            'twelve',
            'thirteen',
            'fourteen',
            'fifteen',
            'sixteen',
            'seventeen',
            'eighteen',
            'nineteen',
            'twenty',
        ];
        const count = words[STOPS.length] ?? String(STOPS.length);
        // Both are wrapped by their formatters, so the words are read across line breaks.
        const flat = (text: string) => text.replace(/\s+/g, ' ');
        expect(flat(page)).toContain(`walks through ${count} of these`);
        expect(flat(readme)).toContain(`walks all ${count}`);
    });

    it('carries the same strip and footer links as the store', () => {
        const urls = [PORTFOLIO_WORK_URL, REPO_URL, PORTFOLIO_URL, GITHUB_PROFILE_URL, LICENSE_URL];
        for (const url of urls) expect(page, url).toContain(`href="${url}"`);
    });

    it('has the landmarks and the headings an audit looks for', () => {
        expect(page).toContain('<html lang="en">');
        expect(page.match(/<h1[ >]/g)).toHaveLength(1);
        expect(page).toContain('<main class="content" id="main-content" tabindex="-1">');
        expect(page).toContain('href="#main-content"');
        expect(page).toContain('aria-label="Portfolio"');
        expect(page.match(/<h2 /g)?.length).toBe(page.match(/<section /g)?.length);
    });
});
