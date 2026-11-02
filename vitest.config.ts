import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    // Workspace packages resolve to their sources, so a test never depends
    // on a build having run first.
    resolve: {
        alias: {
            '@shelflens/catalog': here('./packages/catalog/src/index.ts'),
            '@jasonsdevspace/shelflens': here('./packages/engine/src/index.ts'),
            '@shelflens/search': here('./packages/search/src/index.ts'),
            '@shelflens/api': here('./packages/api/src/index.ts'),
            '@shelflens/server': here('./packages/server/src/index.ts'),
        },
    },
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
