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
        expect(document.querySelector('.tour-count')).toHaveTextContent(
            `Stop 2 of ${STOPS.length}`
        );
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

    it('starts a finished tour over at its first stop', async () => {
        const onIndex = vi.fn();
        const user = userEvent.setup();
        render(
            <Tour
                index={STOPS.length - 1}
                onIndex={onIndex}
                navigate={vi.fn()}
                onClose={vi.fn()}
                takeFocus={false}
            />
        );
        await user.click(screen.getByRole('button', { name: 'Finish' }));
        expect(onIndex).toHaveBeenCalledWith(0);
    });

    it('says where the stop is with the stop, and leaves the test files out of what is heard', () => {
        const second = STOPS[1];
        if (!second) throw new Error('expected a second stop');
        render(<Tour index={1} onIndex={vi.fn()} navigate={vi.fn()} onClose={vi.fn()} takeFocus />);
        const live = document.querySelector('[aria-live]');
        expect(live).toHaveTextContent(`Stop 2 of ${STOPS.length}`);
        expect(live).toHaveTextContent(second.title);
        for (const test of second.tests) expect(live).not.toHaveTextContent(test);
        // The count drawn at the top is the same words, so it is not read a second time.
        expect(document.querySelector('.tour-count')).toHaveAttribute('aria-hidden', 'true');
    });

    it('keeps Previous focusable but off at the first stop, so pressing it there goes nowhere', async () => {
        const onIndex = vi.fn();
        const user = userEvent.setup();
        render(<Tour index={0} onIndex={onIndex} navigate={vi.fn()} onClose={vi.fn()} takeFocus />);
        const previous = screen.getByRole('button', { name: 'Previous' });
        expect(previous).toHaveAttribute('aria-disabled', 'true');
        expect(previous).toBeEnabled();
        await user.click(previous);
        expect(onIndex).not.toHaveBeenCalled();
    });

    it('closes on Escape from inside it', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<Tour index={1} onIndex={vi.fn()} navigate={vi.fn()} onClose={onClose} takeFocus />);
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledOnce();
    });
});
