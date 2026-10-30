import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { hasSeenTour } from '../tour/seen.js';
import { quietTourOnStoreLinks } from './quiet-tour.js';

/*
 * A link from the explainer into the store marks the tour seen, so it does
 * not open over the thing the reader was sent to look at. Other links do
 * not, since nothing on this origin is about to open a tour.
 */

const here = { origin: 'https://example.test', pathname: '/shelflens/about/' } as Location;

const page = (hrefs: readonly string[]) => {
    document.body.innerHTML = hrefs.map((href) => `<a href="${href}">link</a>`).join('');
    quietTourOnStoreLinks(document, here);
    return [...document.querySelectorAll('a')];
};

beforeEach(() => {
    localStorage.clear();
});

describe('the explainer and the tour', () => {
    it('quiets the tour for a link into the store', () => {
        const [root, product] = page([
            'https://example.test/shelflens/',
            'https://example.test/shelflens/?product=SL-00001',
        ]);
        expect(hasSeenTour()).toBe(false);
        fireEvent.click(product as HTMLAnchorElement);
        expect(hasSeenTour()).toBe(true);
        localStorage.clear();
        fireEvent.click(root as HTMLAnchorElement);
        expect(hasSeenTour()).toBe(true);
    });

    it('leaves links off the site, and on the explainer itself, alone', () => {
        const [away, self, anchor] = page([
            'https://github.com/jasonsdevspace/shelflens',
            'https://example.test/shelflens/about/',
            'https://example.test/shelflens/about/#typing',
        ]);
        for (const link of [away, self, anchor]) fireEvent.click(link as HTMLAnchorElement);
        expect(hasSeenTour()).toBe(false);
    });
});
