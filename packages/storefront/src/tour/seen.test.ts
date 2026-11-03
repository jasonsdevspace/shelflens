import { afterEach, describe, expect, it } from 'vitest';

import { keepTourStop, keptTourStop } from './seen.js';

/* The stop a reload resumes on, kept by its id. */

describe('the kept stop', () => {
    afterEach(() => localStorage.removeItem('shelflens.tour.stop'));

    it('resumes on the same stop when stops are added before it', () => {
        keepTourStop('url');
        expect(keptTourStop(['stale', 'url'])).toBe(1);
        expect(keptTourStop(['stale', 'new', 'url'])).toBe(2);
    });

    it('opens on the first stop when nothing was kept, or the kept stop is gone', () => {
        expect(keptTourStop(['stale', 'url'])).toBe(0);
        keepTourStop('removed');
        expect(keptTourStop(['stale', 'url'])).toBe(0);
    });
});
