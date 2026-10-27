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
    webServer: {
        command: 'npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173/',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
