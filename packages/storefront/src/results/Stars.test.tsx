import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { filledShare, Stars } from './Stars.jsx';

describe('the stars of a rating', () => {
    it('fill to the tenth of a star, so 3.2 and 3.8 look different', () => {
        // Three whole stars and two tenths of the fourth's own width, over the row of 77.6.
        expect(filledShare(3.2)).toBe(`${String(Math.round(((48 + 2.72) / 77.6) * 1000) / 10)}%`);
        expect(filledShare(3.8)).toBe(`${String(Math.round(((48 + 10.88) / 77.6) * 1000) / 10)}%`);
        expect(filledShare(3.74)).toBe(filledShare(3.7));
        expect(filledShare(5)).toBe('100%');
        expect(filledShare(0)).toBe('0%');
        // A whole number fills to the start of the next star, so the air after it stays empty.
        expect(filledShare(1)).toBe(`${String(Math.round((16 / 77.6) * 1000) / 10)}%`);
    });

    it('never fill past five or below none', () => {
        expect(filledShare(7)).toBe('100%');
        expect(filledShare(-1)).toBe('0%');
    });

    it('draw five outlined and five solid, the solid cut at the average, all hidden from a screen reader', () => {
        const { container } = render(<Stars average={3.7} />);
        const stars = container.querySelector('.stars');
        expect(stars).toHaveAttribute('aria-hidden', 'true');
        // One picture for each row, of five stars.
        expect(container.querySelectorAll('svg')).toHaveLength(2);
        expect(container.querySelectorAll('.stars-outline')).toHaveLength(5);
        expect(container.querySelectorAll('.stars-solid')).toHaveLength(5);
        expect(container.querySelector('.stars-fill')).toHaveStyle({ width: filledShare(3.7) });
    });

    it('draw each row from the first star’s tip to the last one’s, so no share is spent on air at either end', () => {
        const { container } = render(<Stars average={3.1} />);
        const [x, , width] = (container.querySelector('svg')?.getAttribute('viewBox') ?? '')
            .split(' ')
            .map(Number);
        // The first star's left tip to the last one's right, with no air at either end.
        expect(x).toBe(1.2);
        expect(width).toBeCloseTo(16 * 4 + 13.6);
    });
});
