import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['**/coverage', '**/node_modules', '**/dist'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx,mjs,js}'],
        languageOptions: {
            ecmaVersion: 2023,
            globals: globals.node,
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            // Every callable is a value, so a file reads top to bottom with no
            // hoisting surprises.
            'func-style': ['error', 'expression'],
            'prefer-arrow-callback': ['error', { allowNamedFunctions: false }],
        },
    },
    {
        // Packages that run in the browser as well as in Node. They may not
        // load anything from Node, or the demo stops building. Enforced here
        // rather than discovered there.
        files: ['packages/engine/src/**/*.ts', 'packages/catalog/src/**/*.ts'],
        ignores: ['**/*.test.ts', '**/cli.ts'],
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
