import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useArrivalFocus, useKeptFocus, useReturnFocus } from './useReturnFocus.js';

/*
 * The heading is found by the id the page gives it, whatever it is styled
 * as, so these give it an id and no class at all.
 */

const Arrival = ({
    arrival,
    answered = true,
}: {
    readonly arrival: number | undefined;
    readonly answered?: boolean;
}) => {
    useArrivalFocus('page-heading', arrival, answered);
    return (
        <>
            <h1 id="page-heading" tabIndex={-1}>
                Jackets
            </h1>
            <input type="checkbox" aria-label="Ridgeback" />
        </>
    );
};

const Return = ({
    sku,
    settled = true,
    onDone = () => undefined,
}: {
    readonly sku: string;
    readonly settled?: boolean;
    readonly onDone?: () => void;
}) => {
    const main = useRef<HTMLElement>(null);
    useReturnFocus({ container: main, headingId: 'page-heading', sku, settled, onDone });
    return (
        <main ref={main}>
            <h1 id="page-heading" tabIndex={-1}>
                Jackets
            </h1>
            <a className="card-link" href="?product=SL-1" data-sku="SL-1">
                Ridge Jacket
            </a>
            <input type="checkbox" aria-label="Ridgeback" />
        </main>
    );
};

const Kept = ({ control }: { readonly control: boolean }) => {
    useKeptFocus('page-heading', true);
    return (
        <>
            <h1 id="page-heading" tabIndex={-1}>
                Jackets
            </h1>
            {control && <button type="button">Clear all filters</button>}
            <input type="checkbox" aria-label="Ridgeback" />
        </>
    );
};

const focusOn = (element: HTMLElement) => {
    act(() => {
        element.focus();
    });
};

describe('focus on the results', () => {
    it('goes to the heading by its id when the results arrive', () => {
        const { rerender } = render(<Arrival arrival={undefined} />);
        expect(document.body).toHaveFocus();
        rerender(<Arrival arrival={1} />);
        expect(screen.getByRole('heading', { name: 'Jackets' })).toHaveFocus();
    });

    it('moves to the heading once per arrival, not again when a later answer lands', () => {
        const { rerender } = render(<Arrival arrival={1} />);
        const heading = screen.getByRole('heading', { name: 'Jackets' });
        expect(heading).toHaveFocus();
        act(() => {
            heading.blur();
        });
        rerender(<Arrival arrival={1} answered={false} />);
        rerender(<Arrival arrival={1} />);
        expect(document.body).toHaveFocus();
        rerender(<Arrival arrival={2} />);
        expect(heading).toHaveFocus();
    });

    it('leaves focus where the visitor put it when the results arrive', () => {
        const { rerender } = render(<Arrival arrival={undefined} />);
        const box = screen.getByRole('checkbox', { name: 'Ridgeback' });
        focusOn(box);
        rerender(<Arrival arrival={1} />);
        expect(box).toHaveFocus();
    });

    it('goes back to the card closed, or to the heading when it is gone', () => {
        const { unmount } = render(<Return sku="SL-1" />);
        expect(screen.getByRole('link', { name: 'Ridge Jacket' })).toHaveFocus();
        unmount();
        render(<Return sku="SL-9" />);
        expect(screen.getByRole('heading', { name: 'Jackets' })).toHaveFocus();
    });

    it('leaves focus where the visitor put it while the results loaded, and says it is done', () => {
        const onDone = vi.fn();
        const { rerender } = render(<Return sku="SL-1" settled={false} onDone={onDone} />);
        const box = screen.getByRole('checkbox', { name: 'Ridgeback' });
        focusOn(box);
        rerender(<Return sku="SL-1" onDone={onDone} />);
        expect(box).toHaveFocus();
        expect(onDone).toHaveBeenCalledOnce();
    });

    it('goes to the heading when the control that had focus is gone', () => {
        const { rerender } = render(<Kept control />);
        focusOn(screen.getByRole('button', { name: 'Clear all filters' }));
        rerender(<Kept control={false} />);
        expect(screen.getByRole('heading', { name: 'Jackets' })).toHaveFocus();
    });

    it('leaves focus where it went after the control that had it is gone', () => {
        const { rerender } = render(<Kept control />);
        focusOn(screen.getByRole('button', { name: 'Clear all filters' }));
        // A widget that stops focusin keeps the move from the page, which still knows the last
        // control it saw is gone, so only where focus is now can say the visitor moved it.
        const hide = (event: FocusEvent) => event.stopPropagation();
        window.addEventListener('focusin', hide, { capture: true });
        const box = screen.getByRole('checkbox', { name: 'Ridgeback' });
        try {
            focusOn(box);
            rerender(<Kept control={false} />);
        } finally {
            window.removeEventListener('focusin', hide, { capture: true });
        }
        expect(box).toHaveFocus();
    });
});
