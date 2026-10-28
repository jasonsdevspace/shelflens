import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { serializeSearchState } from '../app/url.js';
import { STOPS } from './stops.js';
import { Tour } from './Tour.jsx';

describe('the tour panel', () => {
    it('walks the stops, links each to its page, and finishes by closing', async () => {
        const navigate = vi.fn();
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<Tour navigate={navigate} onClose={onClose} />);

        const first = STOPS[0];
        if (!first) throw new Error('expected a stop');
        expect(screen.getByRole('complementary', { name: 'Tour' })).toBeInTheDocument();
        expect(screen.getByText(`Stop 1 of ${STOPS.length}`)).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(first.title);
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Next' }));
        const second = STOPS[1];
        if (!second) throw new Error('expected a second stop');
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(second.title);
        expect(screen.getByRole('link', { name: 'Try it' })).toHaveAttribute(
            'href',
            serializeSearchState(second.to) || '?'
        );
        await user.click(screen.getByRole('link', { name: 'Try it' }));
        expect(navigate).toHaveBeenCalledWith(second.to);

        await user.click(screen.getByRole('button', { name: 'Previous' }));
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(first.title);

        for (let i = 1; i < STOPS.length; i += 1) {
            await user.click(screen.getByRole('button', { name: 'Next' }));
        }
        expect(screen.getByText(`Stop ${STOPS.length} of ${STOPS.length}`)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Finish' }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
