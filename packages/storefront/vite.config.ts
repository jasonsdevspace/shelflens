import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { storeApi } from './src/dev/api-plugin.js';
import { themeScript } from './src/dev/theme-plugin.js';

/**
 * The page, and the explainer beside it at about/. The service worker is
 * built separately, by vite.sw.config.ts, because it has to be one file
 * with no shared chunks.
 *
 * BASE_PATH is the path the site is served under, "/shelflens/" on GitHub
 * Pages, and the root locally.
 */
export default defineConfig({
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), storeApi(), themeScript()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        // Two pages would share the preload polyfill as a chunk of its own, one more
        // request on the store's first visit. Every browser that runs the worker
        // preloads modules on its own, so the polyfill is left out.
        modulePreload: { polyfill: false },
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL('./index.html', import.meta.url)),
                about: fileURLToPath(new URL('./about/index.html', import.meta.url)),
            },
        },
    },
});
