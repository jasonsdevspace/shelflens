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
    // A test that passes only when run again is flaky, and fails the run by name
    // rather than hiding behind the retry.
    failOnFlakyTests: Boolean(process.env.CI),
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://localhost:4173/',
        trace: 'retain-on-failure',
    },
    // The screenshots each test compares against, one folder per project, with no
    // platform in the name, since they are only ever taken in one image on Linux.
    snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
    expect: {
        toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.002 },
    },
    // Each project names the files it runs, so a run lists only real skips. The phone
    // has its own spec for the store, and runs what lays out differently on a phone.
    // The screenshot projects run only where VISUAL is set, which is CI's job in
    // Playwright's own Linux image, since text drawn anywhere else differs.
    projects: [
        {
            name: 'desktop',
            use: { ...devices['Desktop Chrome'] },
            testIgnore: /(^|\/)(phone|visual)\.spec\.ts$/,
        },
        {
            name: 'phone',
            use: { ...devices['Pixel 7'] },
            testMatch: /(^|\/)(phone|widget|try-widget|embed|themes)\.spec\.ts$/,
        },
        ...(process.env.VISUAL
            ? [
                  {
                      name: 'visual-desktop',
                      use: { ...devices['Desktop Chrome'] },
                      testMatch: /(^|\/)visual\.spec\.ts$/,
                      grep: /@desktop/,
                  },
                  {
                      name: 'visual-phone',
                      use: { ...devices['Pixel 7'] },
                      testMatch: /(^|\/)visual\.spec\.ts$/,
                      grep: /@phone/,
                  },
              ]
            : []),
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
            // Never one started by hand, which would be open to other origins or none.
            reuseExistingServer: false,
            timeout: 30_000,
        },
        {
            // A page the store does not serve, on an origin of its own, for the embed test.
            command: 'node e2e/host-server.mjs',
            url: 'http://127.0.0.1:4175/',
            reuseExistingServer: false,
            timeout: 30_000,
        },
    ],
});
