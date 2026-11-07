// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { count } from '../format/count.js';
import { DEFAULT_LOCALE } from '../format/locale.js';
import { STOPS } from '../tour/stops.js';
import { CATALOG_ROW_CAP } from '../try/limits.js';
import { SAMPLE_PRODUCTS } from '../try/sample.js';

/*
 * The explainer, the README's two minutes and the tour tell one story.
 * The README's steps are links into the live demo, and each of those
 * states is a link on the explainer too. The stop count the explainer
 * names is the tour's.
 */

const root = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const DEMO = 'https://jasonsdevspace.com/shelflens/';

/** Numbers as the prose writes them, for holding the words to the values. */
const NUMBER_WORDS: readonly string[] = [
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

describe('the explainer', () => {
    const page = read('apps/storefront/about/index.html');
    // Each section from its opening tag to its close, with whatever attributes the tag carries.
    const sections = page.match(/<section[\s>][\s\S]*?<\/section>/g) ?? [];
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
        const count = NUMBER_WORDS[STOPS.length] ?? String(STOPS.length);
        // Both are wrapped by their formatters, so the words are read across line breaks.
        const flat = (text: string) => text.replace(/\s+/g, ' ');
        expect(flat(page)).toContain(`walks through ${count} of these`);
        expect(flat(readme)).toContain(`walks all ${count}`);
    });

    it('names the sample’s button and the cap on a file as the page for your own products does', () => {
        // The page's button is written from the sample's own count, so the two cannot drift.
        const label = `Try it with a sample of ${count(SAMPLE_PRODUCTS, 'product', 'products', DEFAULT_LOCALE)}`;
        const flat = (text: string) => text.replace(/\s+/g, ' ');
        expect(flat(page)).toContain(`Press "${label}"`);
        // Only a cap in whole thousands is written in words, and this one is.
        expect(CATALOG_ROW_CAP % 1000).toBe(0);
        const cap = `${NUMBER_WORDS[CATALOG_ROW_CAP / 1000] ?? ''} thousand products`;
        expect(flat(page)).toContain(cap);
        expect(flat(readme)).toContain(cap);
    });

    it('has the landmarks and the headings an audit looks for', () => {
        expect(page).toContain('<html lang="en">');
        expect(page.match(/<h1[ >]/g)).toHaveLength(1);
        expect(page).toContain('href="#main-content"');
        expect(page).toContain('aria-label="Portfolio"');
        // A section is never named, so it is no landmark, and a reader moves by its heading.
        expect(sections.length).toBeGreaterThan(1);
        for (const section of sections) {
            expect(section).toMatch(/^<section>/);
            expect(section).toMatch(/<h2 id="/);
        }
    });

    it('is laid out as the design kit lays out an explainer', () => {
        expect(page).toContain('<header class="dk-explainer-header">');
        expect(page).toContain('<main class="dk-explainer" id="main-content" tabindex="-1">');
        expect(page).toContain('<p class="dk-explainer-lead">');
        // Each section's number is for the eye alone, since its heading says what it is.
        for (const section of sections) {
            expect(section).toMatch(/<p class="dk-explainer-number" aria-hidden="true">/);
        }
        // The steps stay a list where a browser drops a list's meaning with its markers, and
        // every step after the first opens with the arrow from the one before.
        const list = /<ol class="dk-steps" role="list">([\s\S]*?)<\/ol>/.exec(page)?.[1] ?? '';
        const steps = list.split(/<li(?:\s[^>]*)?>/).slice(1);
        expect(steps.length).toBeGreaterThan(1);
        // The formatter may break a tag before its closing bracket.
        const arrow = /^\s*<span class="dk-steps-arrow" aria-hidden="true"\s*>↓<\/span\s*>/;
        for (const [index, step] of steps.entries()) {
            expect(step).toMatch(/<strong class="dk-steps-title"\s*>/);
            expect(arrow.test(step)).toBe(index > 0);
        }
    });
});
