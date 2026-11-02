import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * The design's values are named once, in tokens.css, and every sheet the
 * store's pages and the widget use refers to them by name. The widget's
 * host pages have a sheet of their own, written to look like someone else's
 * site, which is why it is not one of these.
 */

const SHEETS = ['styles.css', 'try/try.css', 'widget/widget.css', 'search/searchbox.css'];

/** Each declaration of a property in a sheet, with where it is, comments left out. */
const declarations = (property: string) =>
    SHEETS.flatMap((sheet) => {
        const text = readFileSync(join(__dirname, sheet), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        return [...text.matchAll(new RegExp(`(?<![-\\w])${property}:\\s*([^;{}]+);`, 'g'))].map(
            (match) => ({ at: sheet, value: (match[1] ?? '').trim().replace(/\s+/g, ' ') })
        );
    });

const loose = (property: string, allowed: RegExp) =>
    declarations(property)
        .filter(({ value }) => !allowed.test(value))
        .map(({ at, value }) => `${at}: ${property}: ${value}`);

describe('the design tokens', () => {
    it('write the palette once, so no sheet writes a color of its own', () => {
        const colors = SHEETS.flatMap((sheet) => {
            const text = readFileSync(join(__dirname, sheet), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // The feature check for light-dark() names two colors to ask whether it is known.
                .replace('light-dark(#000, #fff)', '');
            return [...text.matchAll(/#[0-9a-f]{3,8}\b|rgba?\(/gi)].map(
                (match) => `${sheet}: ${match[0]}`
            );
        });
        expect(colors).toEqual([]);
    });

    it('name every type size, weight and line height', () => {
        expect([
            ...loose(
                'font-size',
                /^(var\(--text-[a-z]+\)|max\(var\(--text-body\), 16px\)|[\d.]+em|inherit)$/
            ),
            ...loose('font-weight', /^var\(--weight-[a-z]+\)$/),
            ...loose('line-height', /^var\(--(leading-[a-z]+|space-\d)\)$/),
        ]).toEqual([]);
    });

    it('name every corner and every shadow', () => {
        expect([
            // The search box's corners follow its own text, as its sizes do.
            ...loose('border-radius', /^((var\(--radius(-[a-z]+)?\)|0|[\d.]+em)( |$))+$/),
            ...loose('box-shadow', /^(var\(--shadow-raised\)|none)$/),
        ]).toEqual([]);
    });
});
