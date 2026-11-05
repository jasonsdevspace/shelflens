import { act, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cards, open, settled } from './test/store.jsx';

/** A viewport the test can turn across the phone breakpoint, with the listeners the page attached. */
const turnableViewport = () => {
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
    return (toPhone: boolean) =>
        act(() => {
            phone = toPhone;
            for (const listener of listeners) listener();
        });
};

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
        // The drawer covers the chips, so it carries its own way to clear the filters.
        expect(
            within(drawer).getByRole('button', { name: 'Clear all filters' })
        ).toBeInTheDocument();
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
        const turn = turnableViewport();
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

    it('keeps a rule’s problems, its preview and the message after a save across the breakpoint', async () => {
        const turn = turnableViewport();
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = cards().at(-1)?.getAttribute('data-sku') ?? '';
        const panel = () => screen.getByRole('complementary', { name: 'Rules' });
        const drawer = async () => {
            await user.click(screen.getByRole('button', { name: 'Edit rules' }));
            return screen.getByRole('dialog', { name: 'Rules' });
        };
        const missing = /The results have not shown a product with the SKU SL-9\./;

        // A rule refused for what it lacks keeps saying so on a phone.
        await user.click(
            within(await screen.findByRole('complementary', { name: 'Rules' })).getByRole(
                'button',
                { name: 'Add a rule' }
            )
        );
        await user.type(within(panel()).getByRole('combobox', { name: 'Product' }), 'SL-9');
        await user.click(within(panel()).getByRole('button', { name: 'Save rule' }));
        expect(
            within(panel()).getByRole('combobox', { name: 'Product' })
        ).toHaveAccessibleDescription(missing);
        turn(true);
        const onPhone = await drawer();
        const product = within(onPhone).getByRole('combobox', { name: 'Product' });
        expect(product).toHaveAccessibleDescription(missing);

        // A sound rule previews on the page, and still does once the screen is wide again.
        await user.clear(product);
        await user.type(product, last);
        await settled();
        expect(screen.getByText(/Previewing a draft/)).toBeVisible();
        turn(false);
        await settled();
        expect(screen.getByText(/Previewing a draft/)).toBeVisible();

        // The message after a save is still there on a phone.
        await user.click(within(panel()).getByRole('button', { name: 'Save rule' }));
        expect(await within(panel()).findByRole('status')).toHaveTextContent(/Rule saved\./);
        turn(true);
        expect(within(await drawer()).getByRole('status')).toHaveTextContent(/Rule saved\./);
    });

    it('keeps the host’s refusal of a discard across the breakpoint', async () => {
        const turn = turnableViewport();
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = cards().at(-1)?.getAttribute('data-sku') ?? '';
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await user.click(within(panel).getByRole('button', { name: 'Save rule' }));
        await within(panel).findByRole('status');
        // The host refuses the discard, in its own words.
        const real = globalThis.fetch;
        vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
            init?.method === 'DELETE'
                ? Promise.resolve(
                      Response.json(
                          { errors: [{ message: 'the rules are being saved elsewhere' }] },
                          { status: 409 }
                      )
                  )
                : real(input, init)
        );
        const column = screen.getByRole('complementary', { name: 'Rules' });
        await user.click(within(column).getByRole('button', { name: 'Discard your rules' }));
        await user.click(within(column).getByRole('button', { name: 'Yes, discard' }));
        expect(await within(column).findByRole('alert')).toHaveTextContent(
            'the rules are being saved elsewhere'
        );
        turn(true);
        await user.click(screen.getByRole('button', { name: 'Edit rules' }));
        const drawer = screen.getByRole('dialog', { name: 'Rules' });
        expect(within(drawer).getByRole('alert')).toHaveTextContent(
            'the rules are being saved elsewhere'
        );
    });
});
