import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

import { SOURCE_CONDITION } from './source-condition.js';

export default defineConfig({
    // Workspace packages resolve to their sources, by the condition each one's
    // exports name, so a test never depends on a build having run first.
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
    test: {
        // The storefront's tests need a document. Everything else runs in Node.
        projects: [
            {
                extends: true,
                test: {
                    name: 'packages',
                    environment: 'node',
                    include: [
                        'packages/*/src/**/*.test.ts',
                        'packages/engine/smoke/*.test.ts',
                        'scripts/*.test.ts',
                    ],
                    exclude: ['packages/storefront/**'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'storefront',
                    environment: 'jsdom',
                    include: ['packages/storefront/src/**/*.test.{ts,tsx}'],
                    setupFiles: ['packages/storefront/vitest.setup.ts'],
                },
            },
        ],
        coverage: {
            include: ['packages/*/src/**/*.{ts,tsx}'],
            // The harness the App tests share is test code, not the product's.
            exclude: ['**/*.test.{ts,tsx}', '**/cli.ts', '**/generated/**', '**/src/test/**'],
        },
    },
});
