import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { serializeSearchState } from '../app/url.js';
import { STOPS } from './stops.js';
import { Tour } from './Tour.jsx';

describe('the tour panel', () => {
    it('shows the stop it is given, links it to its page, and asks for the next', async () => {
        const navigate = vi.fn();
        const onClose = vi.fn();
        const onIndex = vi.fn();
        const user = userEvent.setup();
        const second = STOPS[1];
        if (!second?.to) throw new Error('expected a second stop with a page');
        render(
            <Tour index={1} onIndex={onIndex} navigate={navigate} onClose={onClose} takeFocus />
        );

        expect(screen.getByRole('complementary', { name: 'Tour' })).toBeInTheDocument();
        expect(screen.getByText(`Stop 2 of ${STOPS.length}`)).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(second.title);
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
        expect(screen.getByRole('link', { name: 'Try it' })).toHaveAttribute(
            'href',
            serializeSearchState(second.to) || '?'
        );
        await user.click(screen.getByRole('link', { name: 'Try it' }));
        expect(navigate).toHaveBeenCalledWith(second.to);
        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(onIndex).toHaveBeenCalledWith(2);
        await user.click(screen.getByRole('button', { name: 'Previous' }));
        expect(onIndex).toHaveBeenCalledWith(0);
    });

    it('has no link on the stop the page cannot reach, and finishes by closing', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(
            <Tour
                index={STOPS.length - 1}
                onIndex={vi.fn()}
                navigate={vi.fn()}
                onClose={onClose}
                takeFocus={false}
            />
        );
        expect(screen.queryByRole('link', { name: 'Try it' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus();
        await user.click(screen.getByRole('button', { name: 'Finish' }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
