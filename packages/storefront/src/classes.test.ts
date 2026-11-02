import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Each component wears classes of its own, named for it, and the few that
 * every component may wear are the shared look: the buttons, the fields,
 * a notice and a callout, a hint beside a choice, a grid of cards, and the
 * page's own frame. A component that wore another's class would change
 * when that one did.
 */

const SHARED = new Set([
    'button',
    'button-primary',
    'button-large',
    'text-button',
    'option-button',
    'select',
    'notice',
    'callout',
    'hint',
    'cards',
    'content',
    'visually-hidden',
]);

/** Every component file, with the classes it names in its markup. */
const components = (): { file: string; classes: string[] }[] => {
    const root = __dirname;
    const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
            entry.isDirectory()
                ? entry.name === 'generated'
                    ? []
                    : walk(join(dir, entry.name))
                : /\.tsx$/.test(entry.name) && !entry.name.includes('.test.')
                  ? [join(dir, entry.name)]
                  : []
        );
    return walk(root).map((path) => {
        const text = readFileSync(path, 'utf8');
        // The class names written out, in quotes or in a template's fixed parts.
        const written = [
            ...[...text.matchAll(/className="([^"]*)"/g)].map((match) => match[1] ?? ''),
            ...[...text.matchAll(/className=\{`([^`]*)`\}/g)].map((match) =>
                (match[1] ?? '').replace(/\$\{[^}]*\}/g, ' ')
            ),
        ];
        return {
            file: relative(root, path),
            classes: written.flatMap((names) => names.split(/\s+/)).filter(Boolean),
        };
    });
};

/** The feature a class is named for: its first word, as "facet" in facet-label. */
const ownerOf = (name: string) => (name.split('-')[0] ?? '').replace(/s$/, '');

/** The features a component file is part of: its folder and each word of its name, as "results", "rule" and "form". */
const featuresOf = (file: string) => {
    const parts = file.replace(/\.tsx$/, '').split('/');
    const stem = parts.pop() ?? '';
    const words = [...parts, ...(stem.match(/[A-Z]?[a-z]+/g) ?? [])];
    return new Set(words.map((word) => word.toLowerCase().replace(/s$/, '')));
};

describe('the components', () => {
    it('wear only their own classes and the shared look', () => {
        const found = components();
        // A class is borrowed when a component of the feature it is named for wears it,
        // and so does a component of another feature.
        const borrowed = [...new Set(found.flatMap(({ classes }) => classes))]
            .filter((name) => !SHARED.has(name))
            .flatMap((name) => {
                const owner = ownerOf(name);
                const wearers = found.filter(({ classes }) => classes.includes(name));
                const owned = wearers.some(({ file }) => featuresOf(file).has(owner));
                return owned
                    ? wearers
                          .filter(({ file }) => !featuresOf(file).has(owner))
                          .map(({ file }) => `${file} wears ${name}`)
                    : [];
            });
        expect(found.length).toBeGreaterThan(SHARED.size);
        expect(borrowed).toEqual([]);
    });
});
