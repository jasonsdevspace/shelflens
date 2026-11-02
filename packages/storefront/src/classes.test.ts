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
const components = (): { file: string; defined: string[]; classes: string[] }[] => {
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
        // The class names written out: in quotes, in a template's fixed parts, and in the
        // quoted strings an expression chooses between.
        const expressions = [...text.matchAll(/className=\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map(
            (match) => match[1] ?? ''
        );
        const written = [
            ...[...text.matchAll(/className="([^"]*)"/g)].map((match) => match[1] ?? ''),
            ...expressions.flatMap((expression) => [
                ...[...expression.matchAll(/'([^']*)'|"([^"]*)"/g)].map(
                    (match) => match[1] ?? match[2] ?? ''
                ),
                ...[...expression.matchAll(/`([^`]*)`/g)].map((match) =>
                    (match[1] ?? '').replace(/\$\{[^}]*\}/g, ' ')
                ),
            ]),
        ];
        // The components the file defines, whose names are features of the file too.
        const defined = [...text.matchAll(/^(?:export )?const ([A-Z]\w*) = /gm)].map(
            (match) => match[1] ?? ''
        );
        return {
            file: relative(root, path),
            defined,
            classes: written.flatMap((names) => names.split(/\s+/)).filter(Boolean),
        };
    });
};

/** The feature a class is named for: its first word, as "facet" in facet-label. */
const ownerOf = (name: string) => (name.split('-')[0] ?? '').replace(/s$/, '');

/** Each word of a name, as "rule" and "form" in RuleForm. */
const wordsOf = (name: string) =>
    (name.match(/[A-Z]?[a-z]+/g) ?? []).map((word) => word.toLowerCase().replace(/s$/, ''));

/** The features the files are named for: each one's folder and each word of its name. */
const namedFor = ({ file }: { file: string }) => {
    const parts = file.replace(/\.tsx$/, '').split('/');
    const stem = parts.pop() ?? '';
    return [...parts.map((part) => part.toLowerCase().replace(/s$/, '')), ...wordsOf(stem)];
};

/** The features a file is part of: those it is named for and those of the components it defines. */
const partOf = (component: { file: string; defined: readonly string[] }) =>
    new Set([...namedFor(component), ...component.defined.flatMap(wordsOf)]);

describe('the components', () => {
    it('wear only their own classes and the shared look', () => {
        const found = components();
        const features = new Set(found.flatMap(namedFor));
        // A class named for a feature is that feature's, so a component that is not part of it
        // borrows it, whether or not the feature's own components wear it too.
        const borrowed = found.flatMap((component) =>
            component.classes
                .filter((name) => !SHARED.has(name))
                .filter((name) => {
                    const owner = ownerOf(name);
                    return features.has(owner) && !partOf(component).has(owner);
                })
                .map((name) => `${component.file} wears ${name}`)
        );
        expect(found.length).toBeGreaterThan(SHARED.size);
        expect(borrowed).toEqual([]);
    });
});
