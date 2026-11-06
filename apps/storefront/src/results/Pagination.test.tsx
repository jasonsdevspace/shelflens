import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination.jsx';

/*
 * The way between pages. A step that goes nowhere is off rather than disabled, so a keyboard that
 * reaches it keeps its place and a screen reader hears it is unavailable, as with every off button
 * in the design kit.
 */

describe('the pages of results', () => {
    it('keeps Previous on the first page in reach, marked off, and goes nowhere when it is pressed', async () => {
        const onPage = vi.fn();
        render(<Pagination page={1} totalPages={3} onPage={onPage} />);
        const previous = screen.getByRole('button', { name: 'Previous' });
        expect(previous).toHaveAttribute('aria-disabled', 'true');
        expect(previous).toBeEnabled();
        await userEvent.tab();
        expect(previous).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        expect(onPage).not.toHaveBeenCalled();
    });

    it('keeps Next on the last page in reach, marked off, and goes nowhere when it is pressed', async () => {
        const onPage = vi.fn();
        render(<Pagination page={3} totalPages={3} onPage={onPage} />);
        const next = screen.getByRole('button', { name: 'Next' });
        expect(next).toHaveAttribute('aria-disabled', 'true');
        expect(next).toBeEnabled();
        next.focus();
        expect(next).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        await userEvent.click(next);
        expect(onPage).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
        expect(onPage).toHaveBeenCalledWith(2);
    });

    it('draws each step as the kit draws a button', () => {
        render(<Pagination page={2} totalPages={3} onPage={() => undefined} />);
        for (const button of screen.getAllByRole('button')) {
            expect(button).toHaveClass('dk-button');
        }
    });
});
