import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveStatus } from './LiveStatus.jsx';

/*
 * The status line says a change once it has settled, so text that changes again and again in
 * quick succession is heard once, as it ends up, and an answer that comes back the same is heard
 * again.
 */

const wait = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });

describe('a status line', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('says each change a moment after it, when it has no time to settle', async () => {
        const { rerender } = render(<LiveStatus text="7 results" />);
        expect(screen.getByRole('status')).toHaveTextContent('');
        await wait(0);
        expect(screen.getByRole('status')).toHaveTextContent('7 results');
        rerender(<LiveStatus text="26 results" />);
        await wait(0);
        expect(screen.getByRole('status')).toHaveTextContent('26 results');
    });

    it('says only where quick changes end up, once they have stayed that long', async () => {
        const { rerender } = render(<LiveStatus text="" settleMs={750} />);
        for (const text of ['7 results', '', '26 results', '', '79 results']) {
            rerender(<LiveStatus text={text} settleMs={750} />);
            await wait(300);
            expect(screen.getByRole('status')).toHaveTextContent('');
        }
        await wait(450);
        expect(screen.getByRole('status')).toHaveTextContent('79 results');
    });

    it('says an answer again when a change brings back the same one', async () => {
        // A sort, or a filter that leaves the count as it was, empties the line while the answer
        // loads and brings back the same words, which have to be heard again as a change.
        const { rerender } = render(<LiveStatus text="26 results" settleMs={750} />);
        await wait(750);
        expect(screen.getByRole('status')).toHaveTextContent('26 results');
        rerender(<LiveStatus text="" settleMs={750} />);
        await wait(200);
        expect(screen.getByRole('status')).toHaveTextContent('');
        rerender(<LiveStatus text="26 results" settleMs={750} />);
        await wait(750);
        expect(screen.getByRole('status')).toHaveTextContent('26 results');
    });
});
