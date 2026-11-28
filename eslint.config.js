import { fileURLToPath } from 'node:url';

import { base, tests, typed } from '@jasonsdevspace/config/eslint';
import { react } from '@jasonsdevspace/config/react';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

import { workspacePackages } from './scripts/repository.mjs';

/*
 * The house's presets from @jasonsdevspace/config, which every project repository takes, and after
 * them the rules that name this repository's own folders.
 */

/**
 * The workspace's packages, as paths from the root: the libraries in packages/ and what runs
 * in apps/.
 */
const WORKSPACES = workspacePackages(fileURLToPath(new URL('./', import.meta.url)));

/** Code that runs in the browser loads no Node module. */
const NO_NODE = { group: ['node:*'], message: 'Runs in the browser, so it cannot load Node.' };

export default defineConfig(
    ...base({
        ignores: [
            // What the tools write is checked where it is written from: the generated operations
            // from the schema and the documents.
            '**/generated',
            // Compiled in the floor job's empty project, against the installed
            // package. Its import resolves to the engine's build, which does not
            // exist yet when the checks that lint it run.
            'packages/engine/smoke/types.ts',
        ],
    }),
    ...typed({
        tsconfigRootDir: import.meta.dirname,
        // The two files at the root, which no tsconfig includes.
        allowDefaultProject: ['vitest.config.ts', 'source-condition.ts'],
    }),
    // The storefront runs in a browser, and its hooks follow React's rules.
    ...react({ files: ['apps/storefront/**/*.{ts,tsx}'] }),
    {
        // The storefront's service worker runs beside its pages, with the worker's globals too.
        files: ['apps/storefront/**/*.{ts,tsx}'],
        languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
    },
    ...tests(),
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
