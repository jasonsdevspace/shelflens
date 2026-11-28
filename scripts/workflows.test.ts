import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { lookupRecord, lookupText, readJson } from './json.js';
import { repositoryFiles } from './repository.mjs';

/** Every workflow, by its path from the top of the repository. */
const workflows = repositoryFiles(import.meta.url, (path) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)
);

/*
 * What the workflows promise that only reading them can hold: a name for
 * every job a reviewer sees in the checks, the screenshots taken in the
 * image of the Playwright the tests pin, a browser installed without the
 * system packages the runner already has and within a time of its own,
 * every install done without its packages' install scripts, an
 * engine published only as the tarball the oldest Node check proved, and a
 * release on GitHub named for the part of the project it is.
 */

const ROOT = join(import.meta.dirname, '..');
const WORKFLOWS = join(ROOT, '.github/workflows');
const read = (name: string) => readFileSync(join(WORKFLOWS, name), 'utf8');

/** Each job in a workflow, by its id, with the lines that belong to it. */
const jobsOf = (text: string): Map<string, string> => {
    const start = /^jobs:[ \t]*(?:#.*)?\r?\n/m.exec(text);
    if (!start) throw new Error('a workflow without a jobs: line, which this test cannot read');
    const body = text.slice(start.index + start[0].length).replace(/\r\n/g, '\n');
    const jobs = new Map<string, string>();
    for (const match of body.matchAll(/^ {4}([a-z][\w-]*):\n((?:(?: {8}.*| *#.*|)\n)*)/gm)) {
        jobs.set(match[1] ?? '', match[2] ?? '');
    }
    return jobs;
};

/** One step of a workflow: how far its dash is indented, and its lines. */
interface Step {
    readonly indent: string;
    readonly text: string;
}

/**
 * A workflow's steps, each with its lines, read without comments or Windows line ends. A comment
 * after a value is dropped as well as a line of one, so a step that mentions a flag in a comment
 * is not taken for using it.
 */
const stepsOf = (text: string): Step[] =>
    [
        ...`${text}\n`
            .replace(/\r\n/g, '\n')
            .replace(/^[ \t]*#.*\n/gm, '')
            .replace(/[ \t]+#[ \t].*$/gm, '')
            .matchAll(/^( *)- .*\n(?:\1 {2}.*\n|[ \t]*\n)*/gm),
    ].map(([step = '', indent = '']) => ({ indent, text: step }));

/** Whether a step installs a browser, by the Playwright package or command it runs. */
const installsBrowser = ({ text }: Step) =>
    /(?:@playwright\/test|playwright(?:-core)?)(?:@\S+)?\s+install\b/.test(text);

/** Whether the step has a time limit of its own, as a key of the step and not of an input. */
const hasOwnTimeLimit = ({ indent, text }: Step) =>
    new RegExp(`^${indent} {2}timeout-minutes: ['"]?[1-5]['"]?\\s*$`, 'm').test(text);

/** npm's subcommands that install, or that run packages' install scripts, in every spelling. */
const INSTALLS = new Set([
    'ci',
    'clean-install',
    'ic',
    'install-clean',
    'isntall-clean',
    'i',
    'in',
    'ins',
    'inst',
    'insta',
    'instal',
    'install',
    'isnt',
    'isnta',
    'isntal',
    'isntall',
    'add',
    'it',
    'cit',
    'sit',
    'install-test',
    'install-ci-test',
    'clean-install-test',
    'rebuild',
    'rb',
    'update',
    'up',
    'upgrade',
    'udpate',
    'dedupe',
    'ddp',
    'link',
    'ln',
]);

/** npm's other subcommands, so a word that is neither is read as a flag's value, not a command. */
const OTHERS = new Set(
    (
        'run run-script rum urn exec x pack view info show v version test tst t publish stage ' +
        'query ls list la ll audit config c pkg init create innit prune uninstall remove rm r un ' +
        'unlink start stop restart cache doctor explain why fund outdated owner search token ' +
        'whoami help bin root prefix sbom diff completion edit explore find-dupes get set hook ' +
        'login logout adduser org team access deprecate dist-tag ping profile repo docs home bugs ' +
        'shrinkwrap star stars unstar unpublish'
    ).split(' ')
);

/** An npm or npx command: which it is, its subcommand, the flags before and the words after it. */
interface NpmCommand {
    readonly npx: boolean;
    readonly command: string;
    readonly flags: readonly string[];
    readonly args: readonly string[];
    readonly line: string;
    /** The folder the step runs in, where it names one. */
    readonly dir: string | undefined;
}

/**
 * Whether a command's flags, before and after its subcommand, leave install scripts off, the last
 * that names them deciding, as npm reads them.
 */
const skipsScripts = ({ flags, args }: NpmCommand) => {
    const words = [...flags, ...args];
    let off = false;
    words.forEach((word, index) => {
        if (word === '--ignore-scripts') off = words[index + 1] !== 'false';
        else if (word === '--ignore-scripts=true') off = true;
        else if (word === '--ignore-scripts=false' || word === '--no-ignore-scripts') off = false;
    });
    return off;
};

/**
 * What a step runs: its `run:` value, a block's lines under it, a folded block joined into one, and
 * nothing of the step's other keys, so a step's name is not read as a command.
 */
const runOf = (step: string): string => {
    const found = /^( *)(?:- )?run: *(.*)$/m.exec(step);
    if (!found) return '';
    const [line = '', indent = '', value = ''] = found;
    if (!/^[|>][-+]?\d*\s*$/.test(value)) return value;
    const block: string[] = [];
    for (const next of step.slice(step.indexOf(line) + line.length + 1).split('\n')) {
        if (next.trim() === '') block.push('');
        else if ((/^ */.exec(next)?.[0].length ?? 0) > indent.length) block.push(next);
        else break;
    }
    return value.startsWith('>') ? block.join(' ') : block.join('\n');
};

/** npx's options before the tool it runs, with the value of each option that takes one. */
const optionsBeforeTool = (words: readonly string[]) => {
    const options: string[] = [];
    for (let at = 0; at < words.length; at += 1) {
        const word = words[at] ?? '';
        if (word === '--' || !word.startsWith('-')) break;
        options.push(word);
        if (['--package', '-p', '--call', '-c'].includes(word)) at += 1;
    }
    return options;
};

/**
 * Whether a command fetches a package and runs it, as npx, `npm exec` and `npm x` do, which runs the
 * package's install scripts, unless `--no-install` holds it to what is already installed.
 */
const fetchesAndRuns = (command: NpmCommand) =>
    (command.npx || command.command === 'exec' || command.command === 'x') &&
    ![...command.flags, ...optionsBeforeTool(command.args)].includes('--no-install');

/** The folder a step names to run in, if it names one. */
const dirOf = (step: string) => /^ *working-directory: *(.+?) *$/m.exec(step)?.[1];

/**
 * Each npm or npx command in what a step runs, wherever it sits: after a keyword, an assignment or
 * another command, inside parentheses or a substitution, with continued lines joined, a quoted word
 * read as the word, and quoted words that hold a space left out, since they are a message that
 * names a command rather than one. A word that is no npm command is read as a flag's value, so the
 * subcommand is the first word npm knows.
 */
const commandsIn = (run: string, dir?: string): NpmCommand[] =>
    run
        .replace(/\\\n\s*/g, ' ')
        .replace(/\\["']/g, '')
        .replace(/"([^"\s]*)"|'([^'\s]*)'/g, '$1$2')
        .replace(/"[^"\n]*"|'[^'\n]*'/g, '""')
        .split(/\n|&&|\|\||;|\||&|\$\(|`|\(|\)/)
        .flatMap((part): NpmCommand[] => {
            const words = part.trim().split(/\s+/).filter(Boolean);
            const at = words.findIndex((word) => word === 'npm' || word === 'npx');
            if (at < 0) return [];
            const npx = words[at] === 'npx';
            const rest = words.slice(at + 1);
            const line = part.trim();
            if (npx) return [{ npx, command: '', flags: [], args: rest, line, dir }];
            let index = 0;
            while (
                index < rest.length &&
                !INSTALLS.has(rest[index] ?? '') &&
                !OTHERS.has(rest[index] ?? '')
            ) {
                index += 1;
            }
            return [
                {
                    npx,
                    command: rest[index] ?? '',
                    flags: rest.slice(0, index),
                    args: rest.slice(index + 1),
                    line,
                    dir,
                },
            ];
        });

/** What a command fetches and runs from npm: a package by its name, or the tool a package provides. */
interface Fetched {
    readonly kind: 'bin' | 'package';
    readonly name: string;
}

/**
 * What npx or `npm exec` runs, from the words after it: the package `--package` names, or else the
 * tool. npx's own options come before the tool, and what follows the tool is the tool's own.
 */
const npxTarget = (words: readonly string[]): Fetched => {
    let at = 0;
    while (at < words.length && (words[at] ?? '').startsWith('-')) {
        at += words[at] === '--package' || words[at] === '-p' ? 2 : 1;
    }
    const options = words.slice(0, at);
    const named = options.findIndex((word) => word === '--package' || word === '-p');
    const pkg =
        options.find((word) => word.startsWith('--package='))?.slice('--package='.length) ??
        (named >= 0 ? options[named + 1] : undefined);
    if (pkg !== undefined) return { kind: 'package', name: pkg.replace(/(?<=.)@.*$/, '') };
    return { kind: 'bin', name: words[at] ?? '' };
};

/**
 * The package a command would fetch and run, if it runs one: what npx or `npm exec` runs, or the
 * initializer `npm init` or `npm create` names. Nothing for a command that runs nothing from npm.
 */
const fetchedBy = ({ npx, command, args }: NpmCommand): Fetched | undefined => {
    const words = args.filter((word) => word !== '--');
    if (npx || command === 'exec' || command === 'x') return npxTarget(words);
    if (!['init', 'create', 'innit'].includes(command)) return undefined;
    const name = words.find((word) => !word.startsWith('-'));
    return name === undefined ? undefined : { kind: 'package', name: `create-${name}` };
};

/** A lockfile's entries, by their path under node_modules, each as unknown until looked at. */
const entriesOf = (lockfile: unknown): [string, unknown][] => {
    const listed =
        typeof lockfile === 'object' && lockfile !== null && 'packages' in lockfile
            ? lockfile.packages
            : undefined;
    if (typeof listed !== 'object' || listed === null) return [];
    return Object.keys(listed).map((key): [string, unknown] => [key, Reflect.get(listed, key)]);
};

/** The commands an entry puts on the path: its own name for a single bin, or each it names. */
const binsOf = (name: string, entry: unknown): string[] => {
    const bin: unknown =
        typeof entry === 'object' && entry !== null && 'bin' in entry ? entry.bin : undefined;
    if (typeof bin === 'string') return [name.split('/').pop() ?? name];
    return typeof bin === 'object' && bin !== null ? Object.keys(bin) : [];
};

/** The packages the lockfile installs at the top of node_modules, and the commands they put on the path. */
const lockfileTools = (lockfile: unknown) => {
    const packages = new Set<string>();
    const bins = new Set<string>();
    for (const [path, entry] of entriesOf(lockfile)) {
        if (path.lastIndexOf('node_modules/') !== 0) continue;
        const name = path.slice('node_modules/'.length);
        packages.add(name);
        for (const bin of binsOf(name, entry)) bins.add(bin);
    }
    return { packages, bins };
};

/** The lockfile at the root, which says what npm installs and what tools npx finds. */
const LOCKFILE = readJson(join(ROOT, 'package-lock.json'));

describe('the workflows', () => {
    const files = readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name));
    /** Every npm and npx command the workflows' steps run. */
    const npmCommands = files.flatMap((file) =>
        stepsOf(read(file)).flatMap(({ text }) => commandsIn(runOf(text), dirOf(text)))
    );

    it('give every job a name that says what it does, not only its id', () => {
        const unnamed = files.flatMap((file) =>
            [...jobsOf(read(file))]
                .filter(([, lines]) => !/^ {8}name: \S/m.test(lines))
                .map(([id]) => `${file}: ${id}`)
        );
        expect(files.length).toBeGreaterThan(0);
        expect(unnamed).toEqual([]);
    });

    it('run every job on a named image, within a time limit of its own', () => {
        const unready = files.flatMap((file) =>
            [...jobsOf(read(file))]
                // A job that calls another workflow takes the image and the time limits of the
                // jobs in it.
                .filter(([, lines]) => !/^ {8}uses:/m.test(lines))
                .filter(
                    ([, lines]) =>
                        !/^ {8}timeout-minutes: \d+[ \t]*(?:#.*)?$/m.test(lines) ||
                        !/^ {8}runs-on: ubuntu-26\.04[ \t]*(?:#.*)?$/m.test(lines)
                )
                .map(([id]) => `${file}: ${id}`)
        );
        expect(unready).toEqual([]);
    });

    it('install dependencies without running their install scripts', () => {
        const installs = npmCommands.filter(
            (command) => INSTALLS.has(command.command) || fetchesAndRuns(command)
        );
        expect(installs.length).toBeGreaterThan(0);
        expect(
            installs.filter((command) => !skipsScripts(command)).map(({ line }) => line)
        ).toEqual([]);
    });

    it('name with npx only the tools the lockfile holds, so a job that installed finds them and one that did not fails rather than fetching', () => {
        const { packages, bins } = lockfileTools(LOCKFILE);
        const fetched = npmCommands
            .filter((command) => {
                const wanted = fetchedBy(command);
                if (wanted === undefined) return false;
                // Outside the repository npx finds none of its tools, and fetches what it runs.
                if (
                    command.dir !== undefined &&
                    (/\$\{\{/.test(command.dir) || command.dir.startsWith('/'))
                )
                    return true;
                return wanted.kind === 'bin' ? !bins.has(wanted.name) : !packages.has(wanted.name);
            })
            .map(({ line }) => line);
        expect(fetched).toEqual([]);
    });

    it('count npx and npm exec as an install, unless --no-install holds them to what is installed', () => {
        const read = (step: string) => commandsIn(runOf(step)).map(fetchesAndRuns);
        expect(read('- run: npx playwright install chromium')).toEqual([true]);
        expect(read('- run: npx --no-install playwright install chromium')).toEqual([false]);
        expect(read('- run: npm exec --package=foo -- foo')).toEqual([true]);
        expect(read('- run: npm x --no-install -- foo')).toEqual([false]);
        expect(read('- run: npx foo --no-install')).toEqual([true]);
        expect(read('- run: npm ci --ignore-scripts')).toEqual([false]);
    });

    it('grant only read access to the repository by default, in every workflow', () => {
        expect(
            [...workflows]
                .filter(([, text]) => !/^permissions:\n {4}contents: read\n(?! )/m.test(text))
                .map(([path]) => path)
        ).toEqual([]);
    });

    it('pin every action to a full commit, in every workflow', () => {
        const unpinned = files.flatMap((file) =>
            [...read(file).matchAll(/^\s+(?:- )?uses: (\S+)/gm)]
                .map((match) => match[1] ?? '')
                .filter((use) => !use.startsWith('./') && !/@[0-9a-f]{40}$/.test(use))
                .map((use) => `${file} ${use}`)
        );
        expect(unpinned).toEqual([]);
        for (const file of ['message.yml', 'release.yml'])
            expect(read(file), file).toMatch(/uses: \S+@[0-9a-f]{40}/);
    });

    it('check out without keeping the token in the repository, in every workflow', () => {
        const keeping = files.flatMap((file) =>
            stepsOf(read(file))
                .filter(({ text }) => /uses: actions\/checkout@/.test(text))
                .filter(({ text }) => !/^\s+persist-credentials: false$/m.test(text))
                .map(() => file)
        );
        expect(keeping).toEqual([]);
        expect(read('message.yml')).toMatch(/uses: actions\/checkout@/);
    });

    it('read an install however it is written, and the flags the last of which decides', () => {
        const read = (step: string) =>
            commandsIn(runOf(step))
                .filter(({ command }) => INSTALLS.has(command))
                .map(skipsScripts);
        expect(read('- run: npm --prefix a ci')).toEqual([false]);
        expect(read('- run: npm --loglevel warn ci --ignore-scripts')).toEqual([true]);
        expect(read('- run: if [ -n "$X" ]; then npm clean-install; fi')).toEqual([false]);
        expect(read('- run: FOO=1 npm ic --ignore-scripts')).toEqual([true]);
        expect(read('- run: |\n      npm ci \\\n          --ignore-scripts')).toEqual([true]);
        expect(read('- run: >\n      npm ci\n      --ignore-scripts')).toEqual([true]);
        expect(read('- run: npm ci --ignore-scripts false')).toEqual([false]);
        expect(read('- run: npm ci --ignore-scripts=true')).toEqual([true]);
        expect(read('- run: npm --ignore-scripts ci')).toEqual([true]);
        expect(read('- run: npm ci --ignore-scripts --no-ignore-scripts')).toEqual([false]);
        expect(read('- run: npm ci "--ignore-scripts"')).toEqual([true]);
        expect(read('- run: (cd site && npm ci)')).toEqual([false]);
        expect(read('- run: npm ci --ignore-scripts & npm install')).toEqual([true, false]);
        expect(read('- run: npm rebuild')).toEqual([false]);
        expect(read("- run: echo it\\'s done; npm ci; echo 'ok'")).toEqual([false]);
        // Words in a message, or in a step's name, that name a command are not a command.
        expect(read('- run: echo "install it with `npm install x`"')).toEqual([]);
        expect(read('- name: Install with npm ci\n  run: echo done')).toEqual([]);
        // npx and npm exec run what the lockfile installed, or name what they fetch.
        expect(commandsIn('npx --package=evil playwright install').map(fetchedBy)).toEqual([
            { kind: 'package', name: 'evil' },
        ]);
        expect(commandsIn('npx tsc -p scripts').map(fetchedBy)).toEqual([
            { kind: 'bin', name: 'tsc' },
        ]);
        expect(commandsIn('npx -p evil@1 tool').map(fetchedBy)).toEqual([
            { kind: 'package', name: 'evil' },
        ]);
        expect(commandsIn('npm create vite').map(fetchedBy)).toEqual([
            { kind: 'package', name: 'create-vite' },
        ]);
    });

    it('publish an engine that runs no script of its own when it is installed', () => {
        const scripts = Object.keys(
            lookupRecord(readJson(join(ROOT, 'packages/engine/package.json')), 'scripts') ?? {}
        );
        expect(scripts.filter((name) => /^(?:pre|post)?install$/.test(name))).toEqual([]);
    });

    it('take the screenshots in the image of the Playwright the tests pin', () => {
        const pinned = lookupText(
            readJson(join(ROOT, 'package.json')),
            'devDependencies',
            '@playwright/test'
        );
        const image = /mcr\.microsoft\.com\/playwright:v([\d.]+)-/.exec(read('ci.yml'))?.[1];
        expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
        expect(image).toBe(pinned);
    });

    it('install a browser without system packages, and give each install a time of its own', () => {
        const steps = files.flatMap((file) => stepsOf(read(file)));
        // The packages come from Ubuntu's mirror, which has been slow enough to run a job out
        // of time before its tests began, and the runner image already has them.
        expect(steps.filter(({ text }) => /--with-deps|\binstall-deps\b/.test(text))).toEqual([]);
        const installs = steps.filter(installsBrowser);
        expect(installs.length).toBeGreaterThan(0);
        expect(installs.filter((step) => !hasOwnTimeLimit(step))).toEqual([]);
    });

    it('read a step the way GitHub does, whatever the step looks like', () => {
        const [step] = stepsOf(
            [
                '            - run: npx @playwright/test install chromium # not --with-deps',
                '              with:',
                '                  timeout-minutes: 3',
            ].join('\n')
        );
        if (!step) throw new Error('expected a step');
        expect(installsBrowser(step)).toBe(true);
        expect(step.text).not.toMatch(/--with-deps/);
        // A time limit given to an action's input is not the step's own.
        expect(hasOwnTimeLimit(step)).toBe(false);
        const [quoted] = stepsOf("    - run: npx playwright install\n      timeout-minutes: '3'");
        if (!quoted) throw new Error('expected a step');
        expect(hasOwnTimeLimit(quoted)).toBe(true);
        const [core] = stepsOf('    - run: npx playwright-core install chromium');
        if (!core) throw new Error('expected a step');
        expect(installsBrowser(core)).toBe(true);
    });

    // The publishing job holds the token trusted publishing issues, so what it installs is what
    // a release trusts most.
    it('install npm where the engine publishes only from a tarball held to a pinned checksum', () => {
        const installs = stepsOf(jobsOf(read('release.yml')).get('publish') ?? '').filter(
            ({ text }) => /\bnpm install -g\b/.test(text)
        );
        expect(installs.length).toBeGreaterThan(0);
        for (const { text } of installs) {
            expect(text).toMatch(/NPM_INTEGRITY: sha512-[A-Za-z0-9+/]+=*\s*$/m);
            // The digest is compared with the pin, and a mismatch stops the step, before the install.
            const compared = text.search(
                /if \[ "\$got" != "\$NPM_INTEGRITY" \]; then\n\s+echo[^\n]*\n\s+exit 1\n/
            );
            expect(text.indexOf('openssl dgst -sha512')).toBeGreaterThan(-1);
            expect(compared).toBeGreaterThan(text.indexOf('openssl dgst -sha512'));
            expect(compared).toBeLessThan(text.indexOf('npm install -g'));
            expect(text).toMatch(/npm install -g --offline --ignore-scripts "\$tarball"/);
            expect(text).not.toMatch(/npm install -g[^\n]*\bnpm@/);
        }
    });

    it('publish only the tarball whose checksum the oldest Node check reported', () => {
        const ci = read('ci.yml');
        const release = read('release.yml');
        expect(ci).toMatch(/engine-sha256:[\s\S]*?value: \$\{\{ jobs\.floor\.outputs\.sha256 \}\}/);
        const floor = jobsOf(ci).get('floor') ?? '';
        // Into a variable first, so a checksum that fails fails the step.
        expect(floor).toMatch(/sum=\$\(sha256sum /);
        expect(floor).toContain('echo "sha256=$sum" >> "$GITHUB_OUTPUT"');
        const publish = jobsOf(release).get('publish') ?? '';
        expect(publish).toContain('SHA256: ${{ needs.checks.outputs.engine-sha256 }}');
        // Checked before anything is staged.
        expect(publish.indexOf('sha256sum -c -')).toBeGreaterThan(0);
        expect(publish.indexOf('sha256sum -c -')).toBeLessThan(
            publish.indexOf('npm stage publish')
        );
    });

    it('name each release on GitHub for the part of the project it is, and the engine for its npm name too', () => {
        const jobs = jobsOf(read('release.yml'));
        /** The step of a job that runs the release script, from its name to the next step. */
        const releaseStep = (job: string) =>
            (jobs.get(job) ?? '')
                .split(/\n(?= {12}- name: )/)
                .find((step) => step.includes('scripts/github-release.sh')) ?? '';
        const engine = releaseStep('engine-release');
        expect(engine).toMatch(
            /scripts\/github-release\.sh [^\n]*\\\n\s+"ShelfLens engine \$VERSION"/
        );
        // The lead is set in the same step, before the script runs, from the package's own name.
        expect(engine).toContain('package="$(jq -r .name packages/engine/package.json)"');
        expect(engine).toMatch(/export NOTES_LEAD=.*npm install \$package@\$VERSION/);
        expect(engine.indexOf('export NOTES_LEAD=')).toBeLessThan(
            engine.indexOf('scripts/github-release.sh')
        );
        expect(releaseStep('storefront')).toMatch(
            /scripts\/github-release\.sh [^\n]*\\\n\s+"ShelfLens storefront \$VERSION"/
        );
    });

    it('run the same checks in CI as `npm run verify` runs, each in a step of its own', () => {
        /** The named scripts a line calls, since `verify` and each CI step call the same ones. */
        const commands = (line: string) => line.split(' && ').map((command) => command.trim());
        const verify = lookupText(readJson(join(ROOT, 'package.json')), 'scripts', 'verify');
        const job = jobsOf(read('ci.yml')).get('verify') ?? '';
        // The checks, by the names a failed run shows, each with the command its step runs.
        const steps = [
            'Type-check',
            'Lint',
            'Format check',
            'Prose check',
            'Node version check',
            'Check for unused exports and dependencies',
            'Unit tests',
        ].map((name) => {
            const run = new RegExp(`- name: ${name}\\n\\s+run: (.+)`).exec(job)?.[1];
            if (run === undefined) throw new Error(`the verify job has no step named ${name}`);
            return run;
        });
        expect(steps.flatMap(commands)).toEqual(commands(verify ?? ''));
    });

    it('release each tag from the folder its package is in', () => {
        const agree = jobsOf(read('release.yml')).get('agree') ?? '';
        for (const [prefix, name] of [
            ['engine-v', 'engine'],
            ['storefront-v', 'storefront'],
        ] as const) {
            const dir = new RegExp(`${prefix}\\*\\) package=${name} dir=(\\S+) ;;`).exec(
                agree
            )?.[1];
            expect(dir, prefix).toBeDefined();
            // The folder holds the package the tag names, with the changelog its notes come from.
            expect(
                lookupText(readJson(join(ROOT, dir ?? '', 'package.json')), 'name'),
                prefix
            ).toBe(name === 'engine' ? '@jasonsdevspace/shelflens' : '@shelflens/storefront');
            expect(readFileSync(join(ROOT, dir ?? '', 'CHANGELOG.md'), 'utf8'), prefix).toContain(
                '## '
            );
        }
    });
});

/**
 * The lines of a workflow's `run:` block that holds `needle`, as the shell receives them, with the
 * block's own indent taken off.
 */
const runBlockWith = (text: string, needle: string): string => {
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes(needle));
    let start = at;
    while (start > 0 && !/^\s*(?:- )?run: \|\s*$/.test(lines[start] ?? '')) start -= 1;
    const indent = /^(\s*)/.exec(lines[start + 1] ?? '')?.[1] ?? '';
    const body: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (line.trim() !== '' && !line.startsWith(indent)) break;
        body.push(line.slice(indent.length));
    }
    return at < 0 ? '' : body.join('\n');
};

/**
 * Every `run:` value in a workflow, a block's lines joined, so a test can read what reaches the
 * shell and nothing else. A block's lines sit deeper than its key, and the key of a `- run:`
 * step sits two places past the dash.
 */
const runsIn = (text: string): string[] => {
    const lines = text.split('\n');
    return lines.flatMap((line, at) => {
        const match = /^(\s*)(- )?run:\s*(.*)$/.exec(line);
        if (!match) return [];
        const [, indent = '', dash = '', value = ''] = match;
        if (!/^[|>][-+0-9]*\s*$/.test(value)) return [value];
        const base = indent.length + dash.length;
        const body: string[] = [];
        for (const next of lines.slice(at + 1)) {
            if (next.trim() !== '' && (/^(\s*)/.exec(next)?.[1]?.length ?? 0) <= base) break;
            body.push(next);
        }
        return [body.join('\n')];
    });
};

describe("the message workflow's check", () => {
    const message = workflows.get('.github/workflows/message.yml') ?? '';
    const script = runBlockWith(message, 'check-commit-message.mjs');
    const installed = fileURLToPath(
        new URL('../node_modules/@jasonsdevspace/prose-check', import.meta.url)
    );
    const work = mkdtempSync(join(tmpdir(), 'message-check-'));
    const manifest: unknown = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
    const version =
        typeof manifest === 'object' &&
        manifest !== null &&
        'version' in manifest &&
        typeof manifest.version === 'string'
            ? manifest.version
            : '';
    execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', work, installed], {
        stdio: 'ignore',
    });
    const tarball = join(work, readdirSync(work).find((name) => name.endsWith('.tgz')) ?? '');
    const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
    const registry = `https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-${version}.tgz`;
    afterAll(() => rmSync(work, { recursive: true, force: true }));

    /**
     * How the step ends for a lockfile entry and a title, run as GitHub runs a step, with `curl`
     * replaced by one that serves the packed prose check whatever address it is given.
     */
    const ends = ({
        resolved = registry,
        hash = integrity,
        named = version,
        title = 'Check each pull request title',
    } = {}) => {
        const dir = mkdtempSync(join(work, 'case-'));
        const bin = join(dir, 'bin');
        const temp = join(dir, 'temp');
        mkdirSync(bin);
        mkdirSync(temp);
        writeFileSync(
            join(dir, 'package-lock.json'),
            JSON.stringify({
                packages: {
                    'node_modules/@jasonsdevspace/prose-check': {
                        version: named,
                        resolved,
                        integrity: hash,
                    },
                },
            })
        );
        writeFileSync(
            join(bin, 'curl'),
            `#!/bin/bash\nwhile [ $# -gt 1 ]; do [ "$1" = --output ] && out=$2; shift; done\ncp "${tarball}" "$out"\n`
        );
        chmodSync(join(bin, 'curl'), 0o755);
        const { status, stdout, stderr } = spawnSync(
            'bash',
            ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
            {
                cwd: dir,
                encoding: 'utf8',
                env: {
                    PATH: `${bin}:${process.env['PATH'] ?? ''}`,
                    RUNNER_TEMP: temp,
                    TITLE: title,
                    BODY: 'A plain body.',
                    AUTHOR: 'someone',
                },
            }
        );
        return { status, output: `${stdout}${stderr}` };
    };

    it('passes a plain title and body from the tarball the lockfile names', () => {
        expect(script).not.toBe('');
        expect(ends().status).toBe(0);
    });

    it('refuses a title that breaks a prose rule, naming the rule', () => {
        const refused = ends({ title: `Check each title ${String.fromCodePoint(0x2014)} twice` });
        expect(refused.status).toBe(1);
        expect(refused.output).toContain('em dash');
    });

    it('refuses a tarball whose hash is not the one the lockfile records', () => {
        const refused = ends({ hash: `${integrity.slice(0, -6)}AAAAA=` });
        expect(refused.status).toBe(1);
        expect(refused.output).toContain("does not match the lockfile's hash");
    });

    it('refuses an address that is not the registry address of the version the lockfile names', () => {
        for (const resolved of [
            'https://example.com/prose-check.tgz',
            `https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-${version}/../../../../evil/-/evil-1.0.0.tgz`,
        ]) {
            const refused = ends({ resolved });
            expect(refused.status, resolved).toBe(1);
            expect(refused.output, resolved).toContain('outside the npm registry');
        }
        const crafted = 'x/../../../evil/-/evil-1.0.0';
        expect(
            ends({
                named: crafted,
                resolved: `https://registry.npmjs.org/@jasonsdevspace/prose-check/-/prose-check-${crafted}.tgz`,
            }).status
        ).toBe(1);
    });
});

describe('what reaches a script', () => {
    it('passes no pull request or event text into a script, only through env', () => {
        const pasted = [...workflows].flatMap(([path, text]) =>
            runsIn(text)
                .filter((run) => /\$\{\{\s*github\.(?:event\.|head_ref)/.test(run))
                .map(() => path)
        );
        expect(pasted).toEqual([]);
        expect(runsIn(workflows.get('.github/workflows/message.yml') ?? '').length).toBeGreaterThan(
            0
        );
    });

    it('runs on no trigger that hands a pull request a privileged token', () => {
        expect(
            [...workflows]
                .filter(([, text]) =>
                    /^\s*(?:pull_request_target|workflow_run)\s*:|\[[^\]]*\b(?:pull_request_target|workflow_run)\b/m.test(
                        text.replace(/^\s*#.*$/gm, '')
                    )
                )
                .map(([path]) => path)
        ).toEqual([]);
    });

    it('finds pull request text pasted into a script, and a privileged trigger', () => {
        expect(runsIn('      - run: echo "${{ github.event.pull_request.title }}"\n')).toEqual([
            'echo "${{ github.event.pull_request.title }}"',
        ]);
        expect(
            runsIn('      - run: |\n          printf %s "${{ github.head_ref }}"\n        env:\n')
        ).toEqual(['          printf %s "${{ github.head_ref }}"']);
    });
});

describe('the git hooks', () => {
    const hooks = repositoryFiles(import.meta.url, (path) => /^\.husky\/[^/_][^/]*$/.test(path));

    it('run npx only on what is installed, so a hook in a checkout without dependencies fetches nothing', () => {
        expect(hooks.size).toBeGreaterThan(0);
        const fetching = [...hooks].flatMap(([path, text]) =>
            text
                .split('\n')
                .filter((line) => /\bnpx\b/.test(line) && !/\bnpx --no-install\b/.test(line))
                .map((line) => `${path}: ${line}`)
        );
        expect(fetching).toEqual([]);
    });
});

/**
 * Where each of `patterns` first matches in `text`, in order, each search starting where the
 * one before ended, or the first pattern that does not match after the one before it.
 */
const inOrder = (text: string, patterns: readonly RegExp[]): string[] => {
    let from = 0;
    return patterns.flatMap((pattern) => {
        const match = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(
            text.slice(from)
        );
        if (!match) return [pattern.source];
        from += match.index + match[0].length;
        return [];
    });
};

describe('the oldest Node job', () => {
    const ci = workflows.get('.github/workflows/ci.yml') ?? '';
    const floor = /^ {4}floor:\n(?: {8}.*\n|[ \t]*\n)*/m.exec(ci)?.[0] ?? '';

    it('proves the engine tarball it reports a checksum for on the oldest Node, before uploading that same tarball', () => {
        expect(floor).not.toBe('');
        expect(
            inOrder(floor, [
                /id: pack\n[\s\S]*?sha256sum "\$\{tarballs\[0\]\}"[\s\S]*?echo "sha256=\$sum" >> "\$GITHUB_OUTPUT"/,
                /floorOf\(require\('\.\/packages\/engine\/package\.json'\)\.engines\.node\)[\s\S]*?> engine-floor/,
                /uses: actions\/setup-node@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+node-version-file: engine-floor/,
                /npm install --engine-strict --ignore-scripts "\$RUNNER_TEMP"\/jasonsdevspace-shelflens-\*\.tgz/,
                /working-directory: \$\{\{ runner\.temp \}\}\/consumer/,
                /uses: actions\/upload-artifact@[0-9a-f]{40}[\s\S]*?path: \$\{\{ runner\.temp \}\}\/jasonsdevspace-shelflens-\*\.tgz/,
            ])
        ).toEqual([]);
    });
});

describe('the release workflow', () => {
    it('uses no cache in its own jobs, and lets the checks it calls read one', () => {
        const release = workflows.get('.github/workflows/release.yml') ?? '';
        expect(release).toMatch(/^cache-mode: none$/m);
        expect(release).toMatch(/^ {4}checks:\n(?: {8}.*\n)*? {8}cache-mode: read\n/m);
    });
});
