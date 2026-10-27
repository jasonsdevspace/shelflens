import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['packages/*/src/**/*.test.ts'],
        coverage: {
            include: ['packages/*/src/**/*.ts'],
            exclude: ['**/*.test.ts', '**/cli.ts'],
        },
    },
});
