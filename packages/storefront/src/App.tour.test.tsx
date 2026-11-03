import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NARROW } from './app/useMediaQuery.js';
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
        // A document draws nothing, so the tour is given a height to be measured at.
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
            this: HTMLElement
        ) {
            return this.matches('.tour') ? new DOMRect(0, 0, 384, 217) : new DOMRect();
        });
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        expect(document.documentElement).toHaveClass('is-touring');
        // Its height as drawn, for the room the page keeps above it.
        expect(document.documentElement.style.getPropertyValue('--tour-height')).toBe('217px');
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

    it('names a stop\'s tests by their files, with commas and a last "and"', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        const index = STOPS.findIndex((stop) => stop.id === 'explain');
        for (let i = 0; i < index; i += 1) {
            await user.click(within(tour).getByRole('button', { name: 'Next' }));
        }
        expect(tour.querySelector('.tour-test')).toHaveTextContent(
            'Tested in search.test.ts, synonyms.test.ts, rules.test.ts and ProductCard.test.tsx'
        );
        // Each file keeps its path from the repository root, on hover.
        expect(
            [...tour.querySelectorAll('.tour-test code')].map((code) => code.getAttribute('title'))
        ).toEqual(STOPS[index]?.tests);
    });

    it('keeps focus on Previous when it reaches the first stop', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        await user.click(within(tour).getByRole('button', { name: 'Next' }));
        const previous = within(tour).getByRole('button', { name: 'Previous' });
        previous.focus();
        await user.keyboard('{Enter}');
        expect(tour).toHaveTextContent('Stop 1 of');
        expect(previous).toHaveFocus();
    });

    it('opens on the stop it was on before the page was reloaded', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open();
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        await user.click(within(tour).getByRole('button', { name: 'Next' }));
        await user.click(within(tour).getByRole('button', { name: 'Next' }));
        cleanup();
        await open();
        expect(screen.getByRole('complementary', { name: 'Tour' })).toHaveTextContent('Stop 3 of');
    });

    it('names the tour from its button only while the tour is open', async () => {
        const user = await open();
        const button = screen.getByRole('button', { name: 'Tour' });
        expect(button).not.toHaveAttribute('aria-controls');
        await user.click(button);
        expect(button).toHaveAttribute('aria-controls', 'tour');
        expect(document.getElementById('tour')).not.toBeNull();
    });

    it('puts focus on what the stop points at once its page arrives, and on the search box for typing', async () => {
        localStorage.removeItem('shelflens.tour');
        const user = await open('?q=boot');
        const tour = screen.getByRole('complementary', { name: 'Tour' });
        await user.click(within(tour).getByRole('link', { name: 'Try it' }));
        await waitFor(() =>
            expect(screen.getByRole('combobox', { name: 'Search the store' })).toHaveFocus()
        );

        const rules = STOPS.findIndex((stop) => stop.id === 'rules');
        for (let i = 0; i < rules; i += 1) {
            await user.click(within(tour).getByRole('button', { name: 'Next' }));
        }
        await user.click(within(tour).getByRole('link', { name: 'Try it' }));
        await waitFor(() => expect(document.querySelector('.set-aside')).toHaveFocus());
    });
});

describe('the tour on a phone', () => {
    /** A screen as wide as a phone's, which `turn` widens past one, as rotating a tablet can. */
    const asPhone = () => {
        let narrow = true;
        const listeners = new Set<() => void>();
        const matchMedia = (query: string) =>
            ({
                get matches() {
                    return query === NARROW && narrow;
                },
                media: query,
                addEventListener: (_: string, listener: () => void) => listeners.add(listener),
                removeEventListener: (_: string, listener: () => void) =>
                    listeners.delete(listener),
            }) as unknown as MediaQueryList;
        Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
        const restore = () => Reflect.deleteProperty(window, 'matchMedia');
        const turn = () => {
            narrow = false;
            act(() => {
                for (const listener of listeners) listener();
            });
        };
        return Object.assign(restore, { turn });
    };

    it('keeps the bar when the screen turns wide, and the Tour button opens the sheet from it', async () => {
        const restore = asPhone();
        try {
            localStorage.removeItem('shelflens.tour');
            const user = await open();
            const button = screen.getByRole('button', { name: 'Tour' });
            // The bar only offers the tour, so the sheet the button opens is not open yet.
            expect(button).toHaveAttribute('aria-expanded', 'false');
            restore.turn();
            expect(screen.getByRole('complementary', { name: 'Tour' })).toHaveTextContent(
                'A tour of what to try'
            );
            await user.click(button);
            expect(screen.getByRole('complementary', { name: 'Tour' })).toHaveTextContent(
                'Stop 1 of'
            );
            expect(button).toHaveAttribute('aria-expanded', 'true');
        } finally {
            restore();
        }
    });

    it('offers the tour in a short bar on a first visit, and opens the sheet on Start', async () => {
        const restore = asPhone();
        try {
            localStorage.removeItem('shelflens.tour');
            const user = await open();
            const bar = screen.getByRole('complementary', { name: 'Tour' });
            expect(bar).toHaveTextContent(`A tour of what to try, ${String(STOPS.length)} stops`);
            expect(within(bar).queryByRole('button', { name: 'Next' })).toBeNull();
            await user.click(within(bar).getByRole('button', { name: 'Start' }));
            const sheet = screen.getByRole('complementary', { name: 'Tour' });
            expect(sheet).toHaveTextContent('Stop 1 of');
            expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus();
        } finally {
            restore();
        }
    });

    it('closes the bar for good on Not now', async () => {
        const restore = asPhone();
        try {
            localStorage.removeItem('shelflens.tour');
            const user = await open();
            const bar = screen.getByRole('complementary', { name: 'Tour' });
            await user.click(within(bar).getByRole('button', { name: 'Not now' }));
            expect(screen.queryByRole('complementary', { name: 'Tour' })).toBeNull();
            expect(localStorage.getItem('shelflens.tour')).toBe('seen');
            expect(screen.getByRole('button', { name: 'Tour' })).toHaveFocus();
        } finally {
            restore();
        }
    });
});
