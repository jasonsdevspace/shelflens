import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { filledShare, Stars } from './Stars.jsx';

describe('the stars of a rating', () => {
    it('fill to the tenth of a star, so 3.2 and 3.8 look different', () => {
        expect(filledShare(3.2)).toBe('64%');
        expect(filledShare(3.8)).toBe('76%');
        expect(filledShare(3.74)).toBe('74%');
        expect(filledShare(5)).toBe('100%');
        expect(filledShare(0)).toBe('0%');
    });

    it('never fill past five or below none', () => {
        expect(filledShare(7)).toBe('100%');
        expect(filledShare(-1)).toBe('0%');
    });

    it('draw five outlined and five solid, the solid cut at the average, all hidden from a screen reader', () => {
        const { container } = render(<Stars average={3.7} />);
        const stars = container.querySelector('.stars');
        expect(stars).toHaveAttribute('aria-hidden', 'true');
        expect(container.querySelectorAll('.stars-outline')).toHaveLength(5);
        expect(container.querySelectorAll('.stars-solid')).toHaveLength(5);
        expect(container.querySelector('.stars-fill')).toHaveStyle({ width: '74%' });
    });
});
