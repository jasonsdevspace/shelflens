import { defaultClientConditions, defineConfig } from 'vite';

import { SOURCE_CONDITION } from '../../source-condition.js';

/**
 * The service worker as one file, beside the page it serves.
 *
 * Library mode bundles the API, the engine and the catalog's types into the
 * worker, which cannot load chunks of its own. It writes into the page's
 * output directory after the page has been built, so it must not empty it.
 */
export default defineConfig({
    // Each workspace package's source, by the condition its exports name.
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: true,
        lib: {
            entry: 'src/worker/sw.ts',
            formats: ['es'],
            fileName: () => 'sw.js',
        },
        rolldownOptions: {
            output: { codeSplitting: false },
        },
    },
});
