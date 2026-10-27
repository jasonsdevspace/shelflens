import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { storeApi } from './src/dev/api-plugin.js';

/**
 * The page. The service worker is built separately, by vite.sw.config.ts,
 * because it has to be one file with no shared chunks.
 *
 * BASE_PATH is the path the site is served under, "/shelflens/" on GitHub
 * Pages, and the root locally.
 */
export default defineConfig({
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), storeApi()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
    },
});
