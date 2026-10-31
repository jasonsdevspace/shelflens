import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { storeApi } from './src/dev/api-plugin.js';
import { themeScript } from './src/dev/theme-plugin.js';

/**
 * The page, the explainer beside it at about/, the widget's host page, and
 * the page for a visitor's own catalog at try/. The service worker is
 * built separately, by vite.sw.config.ts, because it has to be one file
 * with no shared chunks.
 *
 * BASE_PATH is the path the site is served under, "/shelflens/" on GitHub
 * Pages, and the root locally.
 */
export default defineConfig({
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), storeApi(), themeScript()],
    // The preview serves the built files as GitHub Pages does, to any origin, so a page
    // on another origin can load the widget's file from it in the browser test.
    preview: { cors: true },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        // Two pages would share the preload polyfill as a chunk of its own, one more
        // request on the store's first visit. Every browser that runs the worker
        // preloads modules on its own, so the polyfill is left out.
        modulePreload: { polyfill: false },
        rolldownOptions: {
            input: {
                main: fileURLToPath(new URL('./index.html', import.meta.url)),
                about: fileURLToPath(new URL('./about/index.html', import.meta.url)),
                widget: fileURLToPath(new URL('./widget/index.html', import.meta.url)),
                try: fileURLToPath(new URL('./try/index.html', import.meta.url)),
            },
        },
    },
});
