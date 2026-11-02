import { act, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cards, open, settled } from './test/store.jsx';

/* The store on a phone: the facets and the rules in drawers. */

describe('on a phone', () => {
    const narrow = () => {
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query.includes('max-width'),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
        }));
    };
    // The stub outlives restoreAllMocks, so each test starts with no phone until it asks for one.
    afterEach(() => {
        vi.stubGlobal('matchMedia', undefined);
    });

    it('leaves focus alone when the results mount', async () => {
        narrow();
        await open();
        await settled();
        expect(screen.getByRole('button', { name: /Filters/ })).not.toHaveFocus();
    });

    it('keeps the facets in a drawer that is modal while open', async () => {
        narrow();
        const user = await open();
        expect(screen.queryByRole('group', { name: 'Brand' })).not.toBeInTheDocument();
        const opener = screen.getByRole('button', { name: 'Filters' });
        expect(opener).toHaveAttribute('aria-haspopup', 'dialog');

        await user.click(opener);
        const drawer = screen.getByRole('dialog', { name: 'Filters' });
        expect(drawer).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

        const [first] = within(drawer).getAllByRole('checkbox');
        if (!first) throw new Error('expected a facet');
        await user.click(first);
        await settled();
        expect(window.location.search).not.toBe('');
        expect(
            within(drawer).getByRole('button', { name: /Show \d+ results/ })
        ).toBeInTheDocument();

        const audit = await axe.run(document.body, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(audit.violations).toEqual([]);

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Filters/ })).toHaveFocus();
        // The badge's number is said as how many filters are on.
        expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toHaveTextContent('1');
    });

    it('cycles focus inside the drawer with Tab', async () => {
        narrow();
        const user = await open();
        await user.click(screen.getByRole('button', { name: 'Filters' }));
        const drawer = screen.getByRole('dialog', { name: 'Filters' });
        const done = within(drawer).getByRole('button', { name: /Show \d+ results/ });
        done.focus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
        await user.tab({ shift: true });
        expect(done).toHaveFocus();
    });
    it('keeps a half written rule while the drawer is closed to see the results', async () => {
        narrow();
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = cards()[cards().length - 1]?.getAttribute('data-sku') ?? '';
        await user.click(screen.getByRole('button', { name: 'Edit rules' }));
        const drawer = screen.getByRole('dialog', { name: 'Rules' });
        await user.click(within(drawer).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(drawer).getByRole('textbox', { name: 'Name' }), 'Last first');
        await user.type(within(drawer).getByRole('combobox', { name: 'Product' }), last);
        await user.click(within(drawer).getByRole('button', { name: 'Show the results' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await settled();
        expect(screen.getByText(/Previewing a draft/)).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Edit rules' }));
        expect(
            within(screen.getByRole('dialog', { name: 'Rules' })).getByRole('textbox', {
                name: 'Name',
            })
        ).toHaveValue('Last first');
    });
    it('keeps a half typed rule when the layout crosses the phone breakpoint', async () => {
        // A viewport the test can turn, with the listeners the page attached.
        let phone = false;
        const listeners = new Set<() => void>();
        vi.stubGlobal('matchMedia', (query: string) => ({
            get matches() {
                return phone && query.includes('max-width');
            },
            media: query,
            addEventListener: (_: string, listener: () => void) => listeners.add(listener),
            removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
        }));
        const turn = (toPhone: boolean) =>
            act(() => {
                phone = toPhone;
                for (const listener of listeners) listener();
            });
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(panel).getByRole('textbox', { name: 'Name' }), 'Last first');
        turn(true);
        await user.click(screen.getByRole('button', { name: 'Edit rules' }));
        const drawer = screen.getByRole('dialog', { name: 'Rules' });
        expect(within(drawer).getByRole('textbox', { name: 'Name' })).toHaveValue('Last first');
        await user.type(within(drawer).getByRole('combobox', { name: 'Product' }), 'SL-');
        turn(false);
        const again = screen.getByRole('complementary', { name: 'Rules' });
        expect(within(again).getByRole('textbox', { name: 'Name' })).toHaveValue('Last first');
        expect(within(again).getByRole('combobox', { name: 'Product' })).toHaveValue('SL-');
    });
});
