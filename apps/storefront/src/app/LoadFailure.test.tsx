import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadFailure } from './LoadFailure.jsx';

/*
 * What a page says when what it asked for did not arrive, in the design kit's callout for
 * something that went wrong.
 */

describe('a failure to load', () => {
    it('says what failed as an alert that holds the message alone, with the way on beside it', () => {
        render(<LoadFailure what="The products" reason="a 500" onRetry={() => undefined} />);
        const alert = screen.getByRole('alert');
        // The tone is said in words too, so it is not told by its color alone.
        expect(alert).toHaveTextContent(
            /^Error: The products could not be loaded\. Try again, and if it keeps happening, reload the page\./
        );
        expect(within(alert).queryByRole('button')).toBeNull();
        const callout = alert.closest<HTMLElement>('.dk-callout');
        if (!callout) throw new Error('expected the alert in a callout');
        expect(callout).toHaveClass('dk-callout-danger');
        expect(
            within(callout).getByRole('button', { name: 'Try again' }).parentElement
        ).toHaveClass('dk-callout-actions');
    });

    it('says nothing aloud where focus moves to it, which reads it already', () => {
        render(
            <LoadFailure
                what="The products"
                reason="a 500"
                onRetry={() => undefined}
                announce={false}
            />
        );
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByText(/could not be loaded/).closest('.dk-callout')).toHaveClass(
            'dk-callout-danger'
        );
    });
});
