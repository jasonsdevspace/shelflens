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
                    name: 'node',
                    environment: 'node',
                    include: [
                        'packages/*/src/**/*.test.ts',
                        'packages/engine/smoke/*.test.ts',
                        'apps/server/src/**/*.test.ts',
                        'scripts/*.test.ts',
                    ],
                },
            },
            {
                extends: true,
                test: {
                    name: 'storefront',
                    environment: 'jsdom',
                    include: ['apps/storefront/src/**/*.test.{ts,tsx}'],
                    setupFiles: ['apps/storefront/vitest.setup.ts'],
                },
            },
        ],
    },
});
