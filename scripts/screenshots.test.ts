import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { destinationOf, SCREENSHOTS } from './screenshots.mjs';

describe('where a screenshot that differs belongs', () => {
    it('goes beside the picture it differs from, for its project', () => {
        expect(
            destinationOf('visual-the-results-toolbar-visual-desktop', 'toolbar-dark-actual.png')
        ).toBe(join(SCREENSHOTS, 'visual-desktop', 'toolbar-dark.png'));
        expect(
            destinationOf(
                'visual-the-filters-drawer-visual-phone-retry1',
                'drawer-light-actual.png'
            )
        ).toBe(join(SCREENSHOTS, 'visual-phone', 'drawer-light.png'));
        expect(
            destinationOf('visual-toolbar-visual-phone-retry1-repeat1', 'toolbar-dark-actual.png')
        ).toBe(join(SCREENSHOTS, 'visual-phone', 'toolbar-dark.png'));
    });

    it('leaves alone what is not a screenshot test or not the picture it took', () => {
        expect(
            destinationOf('storefront-a-first-visit-desktop', 'shot-actual.png')
        ).toBeUndefined();
        expect(
            destinationOf('visual-toolbar-visual-desktop', 'toolbar-dark-diff.png')
        ).toBeUndefined();
        expect(
            destinationOf('visual-toolbar-visual-desktop', 'toolbar-dark-expected.png')
        ).toBeUndefined();
    });
});
