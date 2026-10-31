import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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

export default tseslint.config(
    {
        ignores: [
            '**/coverage',
            '**/node_modules',
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
                projectService: { allowDefaultProject: ['vitest.config.ts'] },
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
        files: ['packages/storefront/**/*.{ts,tsx}'],
        languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.flat.recommended.rules,
        },
    },
    {
        // Tests read whatever a result happens to contain.
        files: ['**/*.test.{ts,tsx}', 'packages/storefront/vitest.setup.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            'max-params': 'off',
            'sonarjs/cognitive-complexity': 'off',
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
            'packages/storefront/src/**/*.{ts,tsx}',
        ],
        ignores: [
            '**/*.test.{ts,tsx}',
            '**/cli.ts',
            '**/bench.ts',
            '**/bench-cli.ts',
            '**/bundle.test.ts',
            'packages/storefront/src/dev/**',
            'packages/storefront/src/bench/**',
        ],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['node:*'],
                            message: 'Runs in the browser, so it cannot load Node.',
                        },
                    ],
                },
            ],
        },
    }
);
