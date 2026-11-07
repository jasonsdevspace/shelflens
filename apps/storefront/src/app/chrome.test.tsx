import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DemoFooter, PortfolioStrip, SkipLink } from '@jasonsdevspace/design-kit/react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { REPO_URL } from './Portfolio.jsx';

/*
 * The pages written by hand draw the design kit's chrome as the kit's components draw it, so a
 * change to the kit's markup shows up here rather than as a page that looks almost right.
 */

const read = (path: string) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');

/**
 * An element as the page means it, whatever the formatter did to the source: its tag, its
 * attributes in order of name, and its children, with each run of white space read as one space.
 * The white space a browser draws nothing for is dropped: at either end of a paragraph or a box,
 * and alone between the boxes and the links of the strip's rows. Inside a sentence every space
 * counts, so a space gained or lost between two links fails the test.
 */
const shape = (node: Node, parent = ''): string => {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent ?? '').replace(/\s+/g, ' ');
        return text === ' ' && parent !== 'p' && parent !== 'a' ? '' : text;
    }
    if (!(node instanceof Element)) return '';
    const name = node.localName;
    const attributes = [...node.attributes]
        .map((attribute) => `${attribute.name}="${attribute.value}"`)
        .sort()
        .join(' ');
    const joined = [...node.childNodes].map((child) => shape(child, name)).join('');
    const inside = name === 'a' ? joined : joined.trim();
    return `<${name} ${attributes}>${inside}</${name}>`;
};

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

/** The element the page draws with the class given. */
const drawn = (page: Document, className: string): string => {
    const element = page.querySelector(`.${className}`);
    if (!element) throw new Error(`expected the page to draw .${className}`);
    return shape(element);
};

/** The element the kit's component draws. */
const kit = (component: ReactElement): string => {
    const element = parse(renderToStaticMarkup(component)).body.firstElementChild;
    if (!element) throw new Error('expected the component to draw an element');
    return shape(element);
};

/** Each page, where its strip's link to the explainer leads, and whether it has a footer. */
const PAGES: readonly {
    readonly path: string;
    readonly strip: { readonly about: string; readonly current?: 'about' };
    readonly footer: boolean;
}[] = [
    { path: 'about/index.html', strip: { about: './', current: 'about' }, footer: true },
    { path: 'widget/index.html', strip: { about: '../about/' }, footer: false },
    { path: 'try/widget/index.html', strip: { about: '../../about/' }, footer: false },
];

describe('the chrome on the pages written by hand', () => {
    for (const { path, strip, footer } of PAGES) {
        const page = parse(read(path));

        it(`is the kit's skip link and strip on ${path}`, () => {
            expect(drawn(page, 'dk-skip')).toBe(kit(<SkipLink />));
            expect(drawn(page, 'dk-strip')).toBe(
                kit(<PortfolioStrip {...strip} source={REPO_URL} />)
            );
        });

        if (footer) {
            it(`is the kit's footer on ${path}`, () => {
                expect(drawn(page, 'dk-footer')).toBe(
                    kit(<DemoFooter name="ShelfLens" {...strip} source={REPO_URL} />)
                );
            });
        }
    }
});
