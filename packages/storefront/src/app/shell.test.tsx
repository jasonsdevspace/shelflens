import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.jsx';
import { TryPage } from '../try/TryPage.jsx';
import { EXPLAIN_AFTER_MS, Preparing, SHOW_AFTER_MS } from './Preparing.jsx';
import { firstScreen, NO_SCRIPT, shellFor } from './shell.jsx';

/*
 * The build puts each page's first screen into its HTML. The script then
 * draws over it, so what it draws first has to be the same markup, or the
 * page moves as the script takes over.
 */

const waiting = new Promise<void>(() => undefined);

describe('the first screen in the page', () => {
    it('is what the store draws first', () => {
        const { container } = render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={waiting}
            />
        );
        expect(container.innerHTML).toBe(firstScreen('/index.html'));
    });

    it("is what the page for a visitor's products draws first", () => {
        const { container } = render(<TryPage ready={waiting} base="/try/" />);
        expect(container.innerHTML).toBe(firstScreen('/try/index.html'));
    });

    it('tells a browser with JavaScript turned off what to do', () => {
        expect(shellFor('/index.html')).toContain(NO_SCRIPT);
        expect(NO_SCRIPT).toContain('Turn it on in this browser and reload the page.');
    });

    it('refuses a page it has no first screen for', () => {
        expect(() => shellFor('/about/index.html')).toThrow('/about/index.html');
    });
});

describe('the wait for the store', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('says nothing at first, then that the store is being prepared, then why it is slow', () => {
        vi.useFakeTimers();
        render(<Preparing />);
        const status = screen.getByRole('status');
        expect(status).toBeEmptyDOMElement();
        act(() => {
            vi.advanceTimersByTime(SHOW_AFTER_MS - 1);
        });
        expect(status).toBeEmptyDOMElement();
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(status).toHaveTextContent('Preparing the store.');
        act(() => {
            vi.advanceTimersByTime(EXPLAIN_AFTER_MS - SHOW_AFTER_MS);
        });
        expect(status).toHaveTextContent('A first visit takes longer');
    });
});
