import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { workspacePackages } from './scripts/repository.mjs';

/*
 * Three kinds of rule live here.
 *
 * Mechanical ones, such as import order, are fixed by `eslint --fix` and
 * exist so a diff never carries reordering noise. Bug catchers, from
 * typescript-eslint's type-aware set and SonarJS, flag code that is wrong
 * rather than code that is unusual. Size budgets catch a function that has
 * grown past what a reader can hold at once. Everything is an error, since
 * a warning that does not fail the build is a rule nobody follows.
 */

/** Rules that fire on real mistakes and almost never on style. */
const bugCatchers = {
    'sonarjs/no-identical-conditions': 'error',
    'sonarjs/no-identical-expressions': 'error',
    'sonarjs/no-all-duplicated-branches': 'error',
    'sonarjs/no-element-overwrite': 'error',
    'sonarjs/no-ignored-return': 'error',
    'sonarjs/no-use-of-empty-return-value': 'error',
    'sonarjs/no-empty-collection': 'error',
    'sonarjs/no-unused-collection': 'error',
    'sonarjs/no-collection-size-mischeck': 'error',
    'sonarjs/no-extra-arguments': 'error',
    'sonarjs/no-gratuitous-expressions': 'error',
    'sonarjs/no-redundant-jump': 'error',
    eqeqeq: ['error', 'always'],
    'no-param-reassign': 'error',
    'array-callback-return': 'error',
    'no-return-assign': 'error',
};

/** How large a function may grow before it should be split. */
const sizeBudgets = {
    complexity: ['error', 15],
    'sonarjs/cognitive-complexity': ['error', 15],
    'max-depth': ['error', 4],
    'max-params': ['error', 4],
};

/**
 * The workspace's packages, as paths from the root: the libraries in packages/ and what runs
 * in apps/.
 */
const WORKSPACES = workspacePackages(fileURLToPath(new URL('./', import.meta.url)));

/** Code that runs in the browser loads no Node module. */
const NO_NODE = { group: ['node:*'], message: 'Runs in the browser, so it cannot load Node.' };

export default defineConfig(
    {
        linterOptions: { reportUnusedDisableDirectives: 'error' },
    },
    {
        // What the tools write is checked where it is written from: the builds in dist from the
        // sources, and the generated operations from the schema and the documents. ESLint leaves
        // node_modules out on its own.
        ignores: [
            '**/dist',
            '**/generated',
            // Compiled in the floor job's empty project, against the installed
            // package. Its import resolves to the engine's build, which does not
            // exist yet when the checks that lint it run.
            'packages/engine/smoke/types.ts',
        ],
    },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx,mjs,js}'],
        languageOptions: {
            ecmaVersion: 2023,
            globals: globals.node,
        },
        plugins: { 'simple-import-sort': simpleImportSort, 'import-x': importX, sonarjs },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            // Every callable is a value, so a file reads top to bottom with no
            // hoisting surprises.
            'func-style': ['error', 'expression'],
            'prefer-arrow-callback': ['error', { allowNamedFunctions: false }],
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            'import-x/first': 'error',
            'import-x/newline-after-import': 'error',
            'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
            ...bugCatchers,
            ...sizeBudgets,
        },
    },
    {
        // Rules that need the types. The project service reads each
        // package's own tsconfig, which includes its tests.
        files: ['**/*.{ts,tsx}'],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: {
                    // The two files at the root, which no tsconfig includes.
                    allowDefaultProject: ['vitest.config.ts', 'source-condition.ts'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/require-array-sort-compare': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'error',
            '@typescript-eslint/prefer-readonly': 'error',
            // The engine is meant to be exhaustive over its unions, and this
            // is what makes a missing case fail the build.
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
        },
    },
    {
        // The storefront runs in a browser, and its hooks follow React's rules.
        files: ['apps/storefront/**/*.{ts,tsx}'],
        languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
        plugins: { 'react-hooks': reactHooks },
        // What the plugin recommends, with every warning made an error and its options kept.
        rules: Object.fromEntries(
            Object.entries(reactHooks.configs.flat.recommended.rules).map(([rule, setting]) => [
                rule,
                setting === 'warn'
                    ? 'error'
                    : Array.isArray(setting) && setting[0] === 'warn'
                      ? ['error', ...setting.slice(1)]
                      : setting,
            ])
        ),
    },
    {
        // A fixture builder takes a record's fields in order, so a table of fixtures reads as one
        // row per line, which an object of named fields would spread over several.
        files: ['**/*.test.{ts,tsx}'],
        rules: { 'max-params': 'off' },
    },
    {
        // The API's own tests read each answer through the one any in that file, so a test can
        // reach into an answer and let its assertion check the shape. The rules against using
        // an any are off for that file only.
        files: ['packages/api/src/api.test.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
        },
    },
    {
        // Packages that run in the browser as well as in Node. They may not
        // load anything from Node, or the demo stops building. Enforced here
        // rather than discovered there.
        files: [
            'packages/engine/src/**/*.ts',
            'packages/catalog/src/**/*.ts',
            'packages/search/src/**/*.ts',
            'packages/api/src/**/*.ts',
            'apps/storefront/src/**/*.{ts,tsx}',
        ],
        // What runs only in Node: the tests, the command lines, the benchmarks, and the storefront's
        // dev server and benchmark harness.
        ignores: [
            '**/*.test.{ts,tsx}',
            '**/cli.ts',
            '**/bench.ts',
            '**/bench-cli.ts',
            'apps/storefront/src/dev/**',
            'apps/storefront/src/bench/**',
        ],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [NO_NODE],
                },
            ],
        },
    },
    {
        // A type assertion claims a shape nothing checked, and a non-null assertion claims a
        // value is there. Each value is typed by how it is built or narrowed by a check, and a
        // cast that is still needed is allowed on its own line by a disable comment that says
        // why. The engine, search and catalog need none. A const assertion claims nothing and is
        // still allowed.
        files: ['**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
            '@typescript-eslint/no-non-null-assertion': 'error',
        },
    },
    {
        // The worker hosts the API for the pages, so it reads what the API packages
        // offer and never a page's own folder, which would make a page its dependency.
        // Its rule replaces the browser block's restricted imports for these files, so it names
        // Node too.
        files: ['apps/storefront/src/worker/**/*.ts'],
        // A test of the worker may build its input with the pages' code and the shared test
        // helpers, which the worker itself never imports.
        ignores: ['**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        NO_NODE,
                        {
                            group: ['../*', '../**'],
                            message:
                                'The worker takes what it needs from the API packages, not from the pages beside it.',
                        },
                    ],
                },
            ],
        },
    },
    // Each package imports only what its own manifest declares, beside the
    // tools the repository's root provides, so a package never works only
    // because another one happens to install what it uses. Imports of types
    // count too, since a type a package needs is a package it needs. What
    // ships takes only its dependencies, and the tools only its checks.
    ...WORKSPACES.map((path) => ({
        files: [`${path}/**/*.{ts,tsx,mjs,js}`],
        rules: {
            'import-x/no-extraneous-dependencies': [
                'error',
                {
                    packageDir: [
                        fileURLToPath(new URL(`${path}/`, import.meta.url)),
                        fileURLToPath(new URL('./', import.meta.url)),
                    ],
                    includeTypes: true,
                    // A tool the code is checked or built with, never what it ships.
                    devDependencies: [
                        '**/*.test.{ts,tsx}',
                        '**/e2e/**',
                        '**/smoke/**',
                        '**/scripts/**',
                        '**/src/bench/**',
                        '**/src/dev/**',
                        '**/src/test/**',
                        '**/cli.ts',
                        '**/*.config.{ts,js,mjs}',
                        '**/vitest.setup.ts',
                    ],
                },
            ],
        },
    }))
);
