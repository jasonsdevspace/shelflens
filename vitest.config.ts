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
        },
    },
    test: {
        environment: 'node',
        include: ['packages/*/src/**/*.test.ts'],
        coverage: {
            include: ['packages/*/src/**/*.ts'],
            exclude: ['**/*.test.ts', '**/cli.ts'],
        },
    },
});
