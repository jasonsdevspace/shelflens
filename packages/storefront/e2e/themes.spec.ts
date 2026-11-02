import AxeBuilder from '@axe-core/playwright';

import { PAGES } from '../src/bench/pages.js';
import { expect, test } from './support.js';

/*
 * Every page Lighthouse audits, audited by axe in the light theme and in
 * the dark, on the desktop and on the phone, contrast included. The dark
 * theme is where a token that fails contrast hides, and Lighthouse loads
 * each page in the light theme only.
 */

for (const colorScheme of ['light', 'dark'] as const) {
    test(`every page passes axe in the ${colorScheme} theme`, async ({ page, baseURL }) => {
        test.setTimeout(90_000);
        await page.emulateMedia({ colorScheme });
        const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
        // Every page is audited before any is judged, so one failure does not hide the rest.
        const violations: string[] = [];
        for (const { path, prepare, ready } of PAGES) {
            if (prepare) await prepare(page, origin);
            await page.goto(`${origin}${path}`);
            if (ready) await ready(page);
            await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
            const audit = await new AxeBuilder({ page }).analyze();
            violations.push(...audit.violations.map((violation) => `${path}: ${violation.id}`));
        }
        expect(violations, `axe in the ${colorScheme} theme`).toEqual([]);
    });
}
