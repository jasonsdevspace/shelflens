import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Each component wears classes of its own, named for it, and the few that
 * every component may wear are the shared look: the design kit's, under
 * its dk- prefix, the store's own kinds of button, a notice and a callout,
 * a hint, a grid of cards, and the page's own frame. A component that wore
 * another's class would change when that one did.
 */

const SHARED = new Set([
    'option-button',
    'actions',
    'ask',
    'notice',
    'callout',
    'hint',
    'cards',
    'content',
    'visually-hidden',
]);

/** Folders that hold nothing a page is written from: what is built, installed or generated. */
const SKIPPED = new Set(['node_modules', 'dist', 'generated', 'e2e', 'test-results']);

/** The classes a style sheet's selectors name, past its comments and what its values hold. */
const classesOf = (css: string): Set<string> =>
    new Set(
        [
            ...css
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/url\([^)]*\)/g, '')
                .replace(/(['"])(?:(?!\1).)*\1/g, '')
                .matchAll(/\.([a-zA-Z][\w-]*)/g),
        ].map((match) => match[1] ?? '')
    );

/** The classes the design kit's sheets style, the only dk- classes there are. */
const KIT = new Set(
    ['tokens.css', 'base.css', 'components.css'].flatMap((sheet) => [
        ...classesOf(readFileSync(require.resolve(`@jasonsdevspace/design-kit/${sheet}`), 'utf8')),
    ])
);

/** Every file under a folder that `keep` keeps, past the folders nothing is written from. */
const walk = (dir: string, keep: (name: string) => boolean): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? SKIPPED.has(entry.name)
                ? []
                : walk(join(dir, entry.name), keep)
            : keep(entry.name)
              ? [join(dir, entry.name)]
              : []
    );

/** Every component file, with the classes it names in its markup. */
const components = (): { file: string; defined: string[]; classes: string[] }[] => {
    const root = __dirname;
    const isComponent = (name: string) => name.endsWith('.tsx') && !name.includes('.test.');
    return walk(root, isComponent).map((path) => {
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
                .filter((name) => !SHARED.has(name) && !KIT.has(name))
                .filter((name) => {
                    const owner = ownerOf(name);
                    return features.has(owner) && !partOf(component).has(owner);
                })
                .map((name) => `${component.file} wears ${name}`)
        );
        expect(found.length).toBeGreaterThan(SHARED.size);
        expect(borrowed).toEqual([]);
    });

    it('are all a style sheet defines, so no sheet keeps a class nothing wears', () => {
        const app = join(__dirname, '..');
        const sheets = walk(join(app, 'src'), (name) => name.endsWith('.css'));
        // What can write a class: the components, the modules that set one by script, and the
        // pages, which carry the frame drawn before the script. Comments name classes without
        // writing them, so they are left out.
        /** Text with each HTML comment left out, up to where it closes, or to the end if it never does. */
        const withoutHtmlComments = (html: string) =>
            html
                .split('<!--')
                .map((part, index) => {
                    if (index === 0) return part;
                    const end = part.indexOf('-->');
                    return end === -1 ? '' : part.slice(end + 3);
                })
                .join('');
        const text = walk(app, (name) => /\.(tsx?|js|html)$/.test(name) && !name.includes('.test.'))
            .map((path) =>
                withoutHtmlComments(readFileSync(path, 'utf8'))
                    .replace(/\/\*[\s\S]*?\*\//g, '')

                    .replace(/(^|[^:])\/\/.*$/gm, '$1')
            )
            .join('\n');
        // A class a component's template builds, as searchbox-option-${kind}, is worn through
        // the fixed part before the template's value.
        const prefixes = components()
            .flatMap((component) => component.classes)
            .filter((name) => name.endsWith('-'));
        const worn = (name: string) =>
            new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(text) ||
            prefixes.some((prefix) => name.startsWith(prefix));
        const unworn = sheets.flatMap((sheet) => {
            // A class is a selector, so what a rule's values hold, a url or a string, is no class.
            return [...classesOf(readFileSync(sheet, 'utf8'))]
                .filter((name) => !worn(name))
                .map((name) => `${relative(app, sheet)} defines ${name}`);
        });
        expect(sheets.length).toBeGreaterThan(0);
        expect(prefixes).toContain('searchbox-option-');
        expect(unworn).toEqual([]);
    });

    it('leave the pages written by hand only classes a sheet styles, the kit’s or the store’s', () => {
        const app = join(__dirname, '..');
        const styled = new Set([
            ...KIT,
            ...walk(join(app, 'src'), (name) => name.endsWith('.css')).flatMap((sheet) => [
                ...classesOf(readFileSync(sheet, 'utf8')),
            ]),
        ]);
        const pages = walk(app, (name) => name.endsWith('.html'));
        const unstyled = pages.flatMap((page) =>
            [...readFileSync(page, 'utf8').matchAll(/class="([^"]*)"/g)]
                .flatMap((match) => (match[1] ?? '').split(/\s+/).filter(Boolean))
                .filter((name) => !styled.has(name))
                .map((name) => `${relative(app, page)} wears ${name}`)
        );
        expect(pages.length).toBeGreaterThan(1);
        expect(KIT).toContain('dk-button');
        expect(unstyled).toEqual([]);
    });
});
