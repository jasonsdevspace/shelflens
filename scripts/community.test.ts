import { readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lookupRecord, readJson } from './json.js';

/*
 * Every npm script the contributing guide runs is one the repository has, every file, heading
 * and issue template the README, the guide, the security policy or the accessibility statement
 * links to is there, read from the folder each sits in as GitHub reads a relative link, and the
 * statement sends a reader who meets a barrier to the bug template.
 */

const CONTRIBUTING = '.github/CONTRIBUTING.md';
const ACCESSIBILITY = 'docs/ACCESSIBILITY.md';
const FILES = [CONTRIBUTING, '.github/SECURITY.md', ACCESSIBILITY, 'README.md'];
const REPOSITORY = 'jasonsdevspace/shelflens';

const at = (path: string) => new URL(`../${path}`, import.meta.url);
const read = (path: string) => readFileSync(at(path), 'utf8');
const exists = (path: string) => statSync(at(path), { throwIfNoEntry: false }) !== undefined;
const isFile = (path: string) => statSync(at(path), { throwIfNoEntry: false })?.isFile() === true;

/**
 * Markdown with its fenced code blocks taken out, so an example is never read as a heading or link,
 * one indented under a list item too, as the prose check reads them.
 */
const prose = (markdown: string) => markdown.replaceAll(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '');

/** What a reader sees as prose, with inline code taken out too, so a link shown as code is not read. */
const linkable = (markdown: string) => prose(markdown).replaceAll(/`(?:[^`\n]|\n(?!\n))*`/g, '');

/** An anchor or a template name as GitHub reads it, with any percent-encoding undone. */
const decoded = (text: string) => {
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
};

/** A heading's id as GitHub writes it: lower case, punctuation dropped, each space a hyphen. */
const slug = (heading: string) =>
    heading
        .replace(/\s+#+\s*$/, '')
        .trim()
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
        .replaceAll(/\s/g, '-');

/** Every heading id in a Markdown file, with a repeat numbered as GitHub numbers it. */
const headingIds = (markdown: string) => {
    const seen = new Map<string, number>();
    return [...prose(markdown).matchAll(/^#+ (.+)$/gm)].map(([, title]) => {
        const id = slug(title ?? '');
        const count = seen.get(id) ?? 0;
        seen.set(id, count + 1);
        return count === 0 ? id : `${id}-${String(count)}`;
    });
};

/** A link to a path in the repository, with an optional title in any of the forms Markdown allows. */
const LINK =
    /\]\((?![a-z][\w+.-]*:)([^)\s#]*)(?:#([^)\s]*))?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/gi;

/** A link that opens a new issue here, with the template its `template` parameter names. */
const TEMPLATE = new RegExp(
    `github\\.com/${REPOSITORY}/issues/new\\?(?:[^)\\s#]*&)?template=([^&)\\s#]+)`,
    'g'
);

/** The issue templates a file's links open, outside its code. */
const templatesIn = (file: string) =>
    [...linkable(read(file)).matchAll(TEMPLATE)].map(([, template = '']) => decoded(template));

describe('the community files', () => {
    it('takes a fenced block out of the prose, one indented under a list item too', () => {
        const indented = '- A step:\n\n  ```bash\n  # Not a heading\n  ```\n\nAfter.\n';
        expect(prose(indented)).not.toContain('Not a heading');
        expect(prose(indented)).toContain('After.');
        expect(prose('```\n[a](missing.md)\n```\n')).not.toContain('missing.md');
    });

    it('runs only npm scripts the repository has, however a line wraps them', () => {
        const scripts = Object.keys(lookupRecord(readJson(at('package.json')), 'scripts') ?? {});
        const named = [...read(CONTRIBUTING).matchAll(/npm\s+run\s+([\w:-]+)/g)].map(
            ([, script]) => script ?? ''
        );
        expect(named.length).toBeGreaterThan(0);
        expect(named.filter((script) => !scripts.includes(script))).toEqual([]);
    });

    it.each(FILES)('links only files that are there, and headings they hold, from %s', (file) => {
        const missing = [...linkable(read(file)).matchAll(LINK)].flatMap(
            ([, link = '', anchor]) => {
                // The path is left encoded, since `at` builds a URL and reading it decodes it once.
                const heading = anchor === undefined ? undefined : decoded(anchor);
                // A link is read from the folder of the file it is in, as GitHub reads it.
                // GitHub reads a link from the file's own folder, or from the root when it opens
                // with a slash, and serves nothing above the root.
                const target =
                    link === ''
                        ? file
                        : posix.normalize(
                              link.startsWith('/')
                                  ? link.slice(1)
                                  : posix.join(posix.dirname(file), link)
                          );
                if (target === '..' || target.startsWith('../')) return [link];
                if (heading === undefined) return exists(target) ? [] : [target];
                if (!isFile(target)) return [`${target}#${heading}`];
                return headingIds(read(target)).includes(heading) ? [] : [`${target}#${heading}`];
            }
        );
        expect(missing).toEqual([]);
    });

    it.each(FILES)('opens only issue templates the repository has, from %s', (file) => {
        expect(
            templatesIn(file).filter(
                (template) =>
                    template === 'config.yml' || !isFile(`.github/ISSUE_TEMPLATE/${template}`)
            )
        ).toEqual([]);
    });

    it('sends a reader who meets a barrier to the bug template, from the accessibility statement', () => {
        expect(templatesIn(ACCESSIBILITY)).toContain('3-bug.md');
    });
});
