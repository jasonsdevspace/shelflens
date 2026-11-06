import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHeld } from './useHeld.js';

/*
 * A state that only counts once it has lasted a moment, so an answer that comes back quickly never
 * shows the wait at all. The wait is kept in the script rather than in a stylesheet's delay, since
 * a visitor who asks for less motion has every delay in a stylesheet cut to nothing.
 */

const Probe = ({ on }: { readonly on: boolean }) => <p>{useHeld(on, 100) ? 'held' : 'not yet'}</p>;

const wait = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });

describe('a state held for a moment', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('counts only once it has lasted the moment', async () => {
        const { rerender } = render(<Probe on={false} />);
        rerender(<Probe on />);
        await wait(99);
        expect(screen.getByText('not yet')).toBeInTheDocument();
        await wait(1);
        expect(screen.getByText('held')).toBeInTheDocument();
    });

    it('never counts one that ends inside the moment', async () => {
        const { rerender } = render(<Probe on />);
        await wait(60);
        rerender(<Probe on={false} />);
        await wait(200);
        expect(screen.getByText('not yet')).toBeInTheDocument();
    });

    it('stops counting at once when it ends, and waits the moment again when it comes back', async () => {
        const { rerender } = render(<Probe on />);
        await wait(100);
        expect(screen.getByText('held')).toBeInTheDocument();
        rerender(<Probe on={false} />);
        expect(screen.getByText('not yet')).toBeInTheDocument();
        rerender(<Probe on />);
        await wait(50);
        expect(screen.getByText('not yet')).toBeInTheDocument();
        await wait(50);
        expect(screen.getByText('held')).toBeInTheDocument();
    });
});
