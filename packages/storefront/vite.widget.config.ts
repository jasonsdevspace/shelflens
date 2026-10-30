import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The widget as one file, beside the page, for a host page to load.
 *
 * Library mode bundles the search box, the client and a React of its own
 * into widget.js, which a host page imports and mounts. It writes into
 * the page's output directory after the page and the worker have been
 * built, so it must not empty it.
 */
export default defineConfig({
    plugins: [react()],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: true,
        lib: {
            entry: 'src/widget/index.tsx',
            formats: ['es'],
            fileName: () => 'widget.js',
        },
        rollupOptions: {
            output: { inlineDynamicImports: true },
        },
    },
});
