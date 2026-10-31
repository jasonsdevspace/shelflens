import { defineConfig, devices } from '@playwright/test';

/**
 * The storefront in a real browser, served as the demo is served.
 *
 * `npm run e2e` builds the page, the catalog and the worker first, so what
 * runs here is the production build with the service worker answering,
 * not the dev server. Desktop and phone, since the facets become a drawer
 * and the popover changes shape on a narrow screen.
 */
export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://localhost:4173/',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'phone', use: { ...devices['Pixel 7'] } },
    ],
    webServer: [
        {
            command: 'npx vite preview --port 4173 --strictPort',
            url: 'http://localhost:4173/',
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
        {
            // The Node server, as a host on another origin would run it, open to the
            // page the embed test serves from an origin of its own.
            command: 'node packages/server/dist/main.js',
            cwd: '../..',
            env: { PORT: '4174', PRODUCTS: '300', ORIGINS: 'http://127.0.0.1:4175' },
            url: 'http://127.0.0.1:4174/health',
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
        {
            // A page the store does not serve, on an origin of its own, for the embed test.
            command: 'node e2e/host-server.mjs',
            url: 'http://127.0.0.1:4175/',
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
    ],
});
