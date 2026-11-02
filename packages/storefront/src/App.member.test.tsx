import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App.jsx';
import { StoreDocument } from './generated/operations.js';
import { cards, catalog, open, settled, shopAs, shownPrice } from './test/store.jsx';

/* What the viewer switch changes, for a guest and for a member. */

describe('as a member', () => {
    const discounted = catalog.products.find((p) => p.price.member.min < p.price.guest.min);
    const membersOnly = catalog.products.find((p) => p.visibleTo.length === 1);
    if (!discounted || !membersOnly) throw new Error('expected a discount and a hidden product');

    it('pays less on a discounted product, from the moment the viewer changes', async () => {
        const user = await open(`?product=${discounted.sku}`);
        await screen.findByRole('heading', { level: 1, name: discounted.name });
        const asGuest = shownPrice();
        expect(asGuest).toBeGreaterThan(0);
        await shopAs(user, 'member');
        await waitFor(() => expect(shownPrice()).toBeLessThan(asGuest));
        // The product's own line, not a card's in the rail beneath it, with what a guest pays.
        expect(document.querySelector('.product-member')).toHaveTextContent(
            /^Member price, \$[\d,.]+( to \$[\d,.]+)? for guests$/
        );
        expect(screen.getByRole('table', { name: 'Sizes and colors' })).toBeInTheDocument();
        await shopAs(user, 'guest');
        await waitFor(() => expect(shownPrice()).toBe(asGuest));
        expect(document.querySelector('.product-member')).toBeNull();
    });

    it('is told what the switch changed on the page, once, until the next search', async () => {
        const user = await open('?q=jacket');
        await settled();
        expect(screen.queryByText(/Shopping as a member/)).toBeNull();
        const line = () => document.querySelector('.results-aside');
        // The member's answer is held, so the page is seen while it is on its way.
        const served = globalThis.fetch;
        let release = () => undefined as void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            await held;
            return served(input, init);
        });
        await shopAs(user, 'member');
        // The answer in hand is still the guest's, so the line waits rather than speak for it.
        expect(line()).toBeNull();
        release();
        await settled();
        const said = () =>
            screen.getAllByRole('status').filter((status) => /Shopping as/.test(status.textContent))
                .length;
        await waitFor(() => expect(said()).toBe(1));
        expect(line()?.textContent).toMatch(/^Shopping as a member: .*member price/);
        // A way of looking at the same page keeps the line and says nothing again.
        await user.click(screen.getByRole('button', { name: 'Explain ranking' }));
        expect(line()?.textContent).toMatch(/^Shopping as a member/);
        await settled();
        expect(line()?.textContent).toMatch(/^Shopping as a member/);
        // A product opened and closed keeps the line, and the switch is not said again.
        const [first] = cards();
        if (!first) throw new Error('expected a product');
        await user.click(first);
        await user.click(await screen.findByRole('button', { name: 'Back to results' }));
        await settled();
        expect(line()?.textContent).toMatch(/^Shopping as a member/);
        // Two timers queued after the page has drawn, so the notice's own, set once its
        // effect has run, has had its turn to speak whichever way the effect was flushed.
        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
        expect(said()).toBe(0);
        // Switching back says the guest line, with the way to see what it hides.
        await shopAs(user, 'guest');
        await settled();
        await waitFor(() => expect(said()).toBe(1));
        expect(line()).toHaveTextContent(
            'Shopping as a guest: prices are list prices, and products for members only are hidden. Choose "Member" under "Shopping as" to see them.'
        );
        await user.type(screen.getByRole('combobox', { name: 'Search the store' }), 'boot{Enter}');
        await settled();
        expect(screen.queryByText(/Shopping as a/)).toBeNull();
    });

    it('sees a product a guest is told does not exist', async () => {
        // What each view focused was called as focus arrived, so a view reused in place is caught.
        const heard: string[] = [];
        const listen = (event: FocusEvent) => {
            const id = (event.target as Element).getAttribute('aria-labelledby') ?? '';
            heard.push(document.getElementById(id)?.textContent ?? '');
        };
        document.addEventListener('focusin', listen);
        window.history.replaceState(null, '', `/?product=${membersOnly.sku}`);
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={Promise.resolve()}
            />
        );
        const user = userEvent.setup();
        // Focus moves to the notice, which reads it once, so it is not an alert as well.
        const notice = await screen.findByRole('region', { name: /^There is no product / });
        await waitFor(() => expect(notice).toHaveFocus());
        // Focus arrives at the answer itself, not only at the loading line it replaced.
        expect(heard.at(-1)).toMatch(/^There is no product /);
        document.removeEventListener('focusin', listen);
        expect(document.title).toMatch(/^No such product/);
        expect(screen.queryByRole('alert')).toBeNull();
        // Under every missing product, a guest is told how a member would see more, and
        // hears it with the notice as focus arrives.
        expect(notice).toHaveAccessibleDescription(
            'Some products are for members only. Choose "Member" under "Shopping as" to see them.'
        );
        await shopAs(user, 'member');
        await screen.findByRole('heading', { level: 1, name: membersOnly.name });
        expect(screen.getByText('Members only')).toBeInTheDocument();
        // The switch keeps focus, since the visitor is still using it.
        expect(screen.getByRole('combobox', { name: 'Shopping as' })).toHaveFocus();
    });

    it('tells a guest nothing about members where no product is for members only', async () => {
        // The store's own answer, with the one fact a visitor's catalog differs in.
        const op = `op=${String(StoreDocument.__meta__?.['hash'])}`;
        const served = globalThis.fetch;
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            // The address is read before the request is sent, so nothing is read twice.
            const asked = new Request(input, init).url;
            const response = await served(input, init);
            if (!asked.includes(op)) return response;
            const body = (await response.json()) as {
                data: { store: Record<string, unknown> };
            };
            body.data.store.membersOnlyProducts = false;
            const headers = new Headers(response.headers);
            headers.delete('content-length');
            return new Response(JSON.stringify(body), { status: response.status, headers });
        });
        window.history.replaceState(null, '', '/?product=NOPE-1');
        render(
            <App
                apiUrl="http://store.test/graphql"
                eventsUrl="http://store.test/events"
                rulesUrl="http://store.test/rules"
                ready={Promise.resolve()}
            />
        );
        const notice = await screen.findByRole('region', { name: /^There is no product NOPE-1/ });
        expect(notice).not.toHaveAccessibleDescription();
        expect(screen.queryByText(/for members only/)).toBeNull();
    });

    it('keeps the product and its rail on screen while a switch asks again', async () => {
        const seen = catalog.products.find((p) => p.visibleTo.length === 2);
        if (!seen) throw new Error('expected a product every viewer may see');
        const user = await open(`?product=${seen.sku}`);
        await screen.findByRole('heading', { level: 1, name: seen.name });
        const rail = () => screen.queryByRole('region', { name: /Viewed with|Most rated in/ });
        await waitFor(() => expect(rail()).not.toBeNull());
        const served = globalThis.fetch;
        let release = () => undefined as void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            await held;
            return served(input, init);
        });
        await shopAs(user, 'member');
        expect(document.querySelector('article.product')).toHaveAttribute('aria-busy', 'true');
        expect(rail()).not.toBeNull();
        release();
        await waitFor(() =>
            expect(document.querySelector('article.product')).toHaveAttribute('aria-busy', 'false')
        );
        expect(rail()).not.toBeNull();
    });
});
