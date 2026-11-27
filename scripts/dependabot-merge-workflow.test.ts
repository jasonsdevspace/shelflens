// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * What the Dependabot merge workflow promises that only reading it can hold: the job that takes
 * the app's key runs nothing but gh, git and the shell's own words, starts only when the decision
 * says to merge, and is the only job that names a secret.
 */

const workflow = readFileSync(
    new URL('../.github/workflows/dependabot-merge.yml', import.meta.url),
    'utf8'
);

/** A workflow's text without comments or Windows line ends. */
const uncommented = (text: string) =>
    `${text}\n`
        .replace(/\r\n/g, '\n')
        .replace(/^[ \t]*#.*\n/gm, '')
        .replace(/[ \t]+#[ \t].*$/gm, '');

/** A workflow's jobs, each by its id with the lines under it. */
const jobsOf = (text: string) => {
    const lines = uncommented(text);
    const start = lines.search(/^jobs:/m);
    if (start < 0) return [];
    return lines
        .slice(start)
        .split(/^ {4}(?=[A-Za-z_][\w-]*:\s*$)/m)
        .slice(1)
        .map((block) => ({
            id: block.slice(0, block.indexOf(':')),
            body: `\n${block.slice(block.indexOf('\n') + 1)}`,
        }));
};

/** The shell's own words and the commands the job holding the app's key may run. */
const ALLOWED = new Set([
    'git',
    'gh',
    'echo',
    'exit',
    '[',
    'test',
    'true',
    'if',
    'then',
    'else',
    'elif',
    'fi',
]);

/** Words an allowed command may not be given, since with them it runs anything. */
const ESCAPES = /^(?:git\s+(?:-c\b|.*\balias\b)|gh\s+(?:extension|alias)\b)/;

/** The lines of a `run` key's block, which runs on while they sit deeper than the key or are blank. */
const blockOf = (lines: readonly string[], at: number, indent: number, value: string) => {
    if (!/^[|>][-+0-9]*$/.test(value)) return [value];
    const block: string[] = [];
    for (const next of lines.slice(at + 1)) {
        if (next.trim() !== '' && next.length - next.trimStart().length <= indent) break;
        block.push(next);
    }
    return block;
};

/** Each command a script runs, with the assignments before a command left off. */
const commandsOf = (script: string) =>
    script
        .replace(/\\\n\s*/g, ' ')
        .split(/&&|\|\||;|\||&|\$\(|[<>]\(|`|\n/)
        .map((command) =>
            command
                .trim()
                .replace(/^(?:(?:if|then|else|elif|do|!)\s+)+/, '')
                .replace(/^(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\S*)\s*)+/, '')
                .trim()
        )
        .filter((command) => command !== '' && !command.startsWith('#'));

/**
 * What a job runs beyond what `ALLOWED` names: the first word of each command in its `run` blocks
 * that is not allowed or is given a word that lets it run anything, each action of the account's
 * own it uses, any shell it names, and any write to the environment or the path later steps see.
 */
const straysOf = (body: string) => {
    const lines = body.split('\n');
    return lines.flatMap((line, at) => {
        const uses = /^\s*(?:-\s+)?uses:\s*['"]?([^'"\s]+)/.exec(line)?.[1];
        if (uses?.startsWith('.') || uses?.startsWith('jasonsdevspace/')) return [uses];
        const shell = /^\s*(?:-\s+)?shell:\s*(\S+)/.exec(line)?.[1];
        if (shell) return [`shell: ${shell}`];
        const run = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(line);
        if (!run) return [];
        const script = blockOf(lines, at, (run[1] ?? '').length, run[2] ?? '').join('\n');
        const written = /\$\{?GITHUB_(?:ENV|PATH)\b/.test(script)
            ? ['GITHUB_ENV or GITHUB_PATH']
            : [];
        return [
            ...written,
            ...commandsOf(script).flatMap((command) => {
                const first = command.split(/\s+/)[0] ?? '';
                return !ALLOWED.has(first) || ESCAPES.test(command) ? [first] : [];
            }),
        ];
    });
};

const holding = jobsOf(workflow).filter(({ body }) =>
    /actions\/create-github-app-token@/.test(body)
);

describe('the Dependabot merge workflow', () => {
    it('runs nothing but gh, git and the shell in the job that takes the app key', () => {
        expect(holding.map(({ id }) => id)).toEqual(['merge']);
        expect(holding.flatMap(({ body }) => straysOf(body))).toEqual([]);
    });

    it('starts the job that takes the app key only when the decision says to merge', () => {
        const [merge] = holding;
        expect(merge?.body).toMatch(/^ {8}needs: decide\s*$/m);
        expect(merge?.body).toMatch(/^ {8}if: needs\.decide\.outputs\.merge == 'true'\s*$/m);
    });

    it('names a secret in the job that takes the app key alone, and none for the whole workflow', () => {
        const text = uncommented(workflow);
        expect(text.slice(0, text.search(/^jobs:/m))).not.toMatch(/\bsecrets\b/);
        const naming = jobsOf(workflow)
            .filter(({ body }) => /\bsecrets\b/.test(body))
            .map(({ id }) => id);
        expect(naming).toEqual(['merge']);
    });

    it('reads a job the way GitHub does, and finds what it should not run', () => {
        const steps = (line: string) => `\n        steps:\n            - ${line}\n`;
        expect(straysOf(steps('run: npx something'))).toEqual(['npx']);
        expect(straysOf(steps('run: node scripts/x.mjs'))).toEqual(['node']);
        expect(straysOf(steps('run: ./scripts/x.sh'))).toEqual(['./scripts/x.sh']);
        expect(straysOf(steps('run: gh pr list && npm ci'))).toEqual(['npm']);
        expect(straysOf(steps('run: echo "$(npm ci)"'))).toEqual(['npm']);
        expect(straysOf(steps("run: git -c alias.x='!npm ci' x"))).toEqual(['git']);
        expect(straysOf(steps('run: gh extension install x'))).toEqual(['gh']);
        expect(straysOf(steps('run: echo x >> "$GITHUB_ENV"'))).toEqual([
            'GITHUB_ENV or GITHUB_PATH',
        ]);
        expect(straysOf(steps('uses: ./.github/actions/x'))).toEqual(['./.github/actions/x']);
        expect(straysOf(`${steps('run: echo hi')}              shell: node {0}\n`)).toEqual([
            'shell: node',
        ]);
        expect(
            straysOf(
                steps('run: |\n                  open="$(gh pr list)"\n                  git push')
            )
        ).toEqual([]);
        const jobs = jobsOf('jobs:\n    a:\n        name: A\n    b:\n        name: B\n');
        expect(jobs.map(({ id }) => id)).toEqual(['a', 'b']);
        expect(jobs[0]?.body).toContain('name: A');
        expect(jobs[0]?.body).not.toContain('name: B');
    });
});
