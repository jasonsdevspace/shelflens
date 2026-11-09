import { fileURLToPath } from 'node:url';

import { browserFloor, themeScriptPlugin } from '@jasonsdevspace/design-kit/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

import { SOURCE_CONDITION } from '../../source-condition.js';
import { storeApi } from './src/dev/api-plugin.js';
import { pagePolicy } from './src/dev/page-policy-plugin.js';
import { pageShell } from './src/dev/shell-plugin.js';

/**
 * The page, the explainer beside it at about/, the widget's host page, the
 * page for a visitor's own catalog at try/, and the widget's host page over
 * that catalog at try/widget/. The service worker is
 * built separately, by vite.sw.config.ts, because it has to be one file
 * with no shared chunks.
 *
 * BASE_PATH is the path the site is served under, "/shelflens/" on GitHub
 * Pages, and the root locally.
 */
export default defineConfig({
    base: process.env['BASE_PATH'] ?? '/',
    plugins: [react(), storeApi(), themeScriptPlugin(), pagePolicy(), pageShell()],
    // Each workspace package's source, by the condition its exports name.
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    // The preview serves the built files as GitHub Pages does, to any origin, so a page
    // on another origin can load the widget's file from it in the browser test.
    preview: { cors: true },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        // The design kit's browser floor, as the pinned version gives it, for the script and the
        // sheets alike, so the minifier leaves each light-dark() as it is, which picks by the
        // scheme of the element that draws it. A wider target rewrites it into switches set on the
        // root, so a part of a page set to the other scheme would keep the page's colors, and a
        // browser under the floor would run the store without the kit's colors. Taken from the
        // kit, it moves with the kit when the kit raises its floor.
        target: browserFloor(),
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
                tryWidget: fileURLToPath(new URL('./try/widget/index.html', import.meta.url)),
            },
        },
    },
});
