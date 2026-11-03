import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useArrivalFocus, useReturnFocus } from './useReturnFocus.js';

/*
 * The heading is found by the id the page gives it, whatever it is styled
 * as, so these give it an id and no class at all.
 */

const Arrival = ({ arrival }: { readonly arrival: number | undefined }) => {
    useArrivalFocus('page-heading', arrival, true);
    return (
        <h1 id="page-heading" tabIndex={-1}>
            Jackets
        </h1>
    );
};

const Return = ({ sku }: { readonly sku: string }) => {
    const main = useRef<HTMLElement>(null);
    useReturnFocus({
        container: main,
        headingId: 'page-heading',
        sku,
        settled: true,
        onDone: () => undefined,
    });
    return (
        <main ref={main}>
            <h1 id="page-heading" tabIndex={-1}>
                Jackets
            </h1>
            <a className="card-link" href="?product=SL-1" data-sku="SL-1">
                Ridge Jacket
            </a>
        </main>
    );
};

describe('focus on the results', () => {
    it('goes to the heading by its id when the results arrive', () => {
        const { rerender } = render(<Arrival arrival={undefined} />);
        expect(document.body).toHaveFocus();
        rerender(<Arrival arrival={1} />);
        expect(screen.getByRole('heading', { name: 'Jackets' })).toHaveFocus();
    });

    it('goes back to the card closed, or to the heading when it is gone', () => {
        const { unmount } = render(<Return sku="SL-1" />);
        expect(screen.getByRole('link', { name: 'Ridge Jacket' })).toHaveFocus();
        unmount();
        render(<Return sku="SL-9" />);
        expect(screen.getByRole('heading', { name: 'Jackets' })).toHaveFocus();
    });
});
