import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { open } from './test/store.jsx';
import { STOPS } from './tour/stops.js';

/* The tour, which opens on a first visit and walks every stop. */

describe('the tour', () => {
    it('opens on a first visit, stays closed once finished, and reopens on request', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        expect(tour).toHaveTextContent('Stop 1 of');
        expect(screen.getByRole('button', { name: 'Tour' })).toHaveAttribute(
            'aria-expanded',
            'true'
        );

        await user.click(within(tour).getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('complementary', { name: 'Tour' })).toBeNull();
        expect(localStorage.getItem('shelflens.tour')).toBe('seen');

        expect(screen.getByRole('button', { name: 'Tour' })).toHaveFocus();

        await user.click(screen.getByRole('button', { name: 'Tour' }));
        const reopened = screen.getByRole('complementary', { name: 'Tour' });
        expect(within(reopened).getByRole('button', { name: 'Close' })).toHaveFocus();
    });

    it('marks the page with its height while it is open, so focus is kept clear of it, and unmarks it once closed', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        expect(document.documentElement).toHaveClass('is-touring');
        // Its height as drawn, for the room the page keeps above it.
        expect(document.documentElement.style.getPropertyValue('--tour-height')).toMatch(/px$/);
        await user.click(within(tour).getByRole('button', { name: 'Close' }));
        expect(document.documentElement).not.toHaveClass('is-touring');
        expect(document.documentElement.style.getPropertyValue('--tour-height')).toBe('');
    });

    it('resumes at the stop it was closed on', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        await user.click(within(tour).getByRole('button', { name: 'Next' }));
        await user.click(within(tour).getByRole('button', { name: 'Next' }));
        expect(tour).toHaveTextContent('Stop 3 of');
        await user.click(within(tour).getByRole('button', { name: 'Close' }));
        await user.click(screen.getByRole('button', { name: 'Tour' }));
        expect(screen.getByRole('complementary', { name: 'Tour' })).toHaveTextContent('Stop 3 of');
    });

    it('leads to the page each stop describes, and stays open there', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        for (let i = 0; i < 4; i += 1) {
            await user.click(within(tour).getByRole('button', { name: 'Next' }));
        }
        expect(tour).toHaveTextContent('The cache that forgets who is asking');
        await user.click(within(tour).getByRole('link', { name: 'Try it' }));
        expect(window.location.search).toBe('?product=SL-00008');
        expect(await screen.findByText(/There is no product/)).toBeInTheDocument();
        expect(screen.getByRole('complementary', { name: 'Tour' })).toBeInTheDocument();
    });

    it('lists a stop\'s tests with commas and a last "and"', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        const index = STOPS.findIndex((stop) => stop.id === 'explain');
        for (let i = 0; i < index; i += 1) {
            await user.click(within(tour).getByRole('button', { name: 'Next' }));
        }
        expect(tour.querySelector('.tour-test')).toHaveTextContent(
            'Tested in packages/engine/src/search.test.ts, packages/engine/src/synonyms.test.ts, packages/engine/src/rules.test.ts and packages/storefront/src/results/ProductCard.test.tsx'
        );
    });
});
