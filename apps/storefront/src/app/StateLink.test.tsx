import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StateLink } from './StateLink.jsx';
import { EMPTY_STATE } from './url.js';

const link = () => {
    const navigate = vi.fn();
    render(
        <StateLink to={{ ...EMPTY_STATE, phrase: 'jacket' }} navigate={navigate}>
            Jackets
        </StateLink>
    );
    return { navigate, anchor: screen.getByRole('link', { name: 'Jackets' }) };
};

describe('a link to another page state', () => {
    it('navigates in place on a plain click', () => {
        const { navigate, anchor } = link();
        expect(fireEvent.click(anchor)).toBe(false);
        expect(navigate).toHaveBeenCalledOnce();
    });

    it.each([
        ['Alt', { altKey: true }],
        ['Shift', { shiftKey: true }],
        ['Ctrl', { ctrlKey: true }],
        ['Cmd', { metaKey: true }],
        ['the middle button', { button: 1 }],
    ])('leaves a click with %s to the browser', (_, init) => {
        const { navigate, anchor } = link();
        expect(fireEvent.click(anchor, init)).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
    });
});
