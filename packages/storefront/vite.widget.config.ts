import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The widget as one file, beside the page, for a host page to load.
 *
 * An ordinary build with one entry and no chunks, rather than library
 * mode, which leaves whitespace in an ES file: a host loads this file
 * into a browser as it is, so it is minified like the page. It writes into
 * the page's output directory after the page and the worker have been
 * built, so it must not empty it.
 */
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: true,
        rolldownOptions: {
            input: 'src/widget/index.tsx',
            preserveEntrySignatures: 'exports-only',
            output: {
                format: 'es',
                entryFileNames: 'widget.js',
                codeSplitting: false,
            },
        },
    },
});
