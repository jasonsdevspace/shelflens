import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { cards, featured, open, settled } from './test/store.jsx';

/* Why each result ranked where it did, and the rules a merchandiser previews and saves. */

describe('explain mode', () => {
    it('says why each result ranked where it did, from the URL', async () => {
        const user = await open('?q=jacket&explain=1');
        await settled();
        expect(screen.getByRole('button', { name: 'Explain ranking' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        const [first, second] = cards().map((card) => card.closest('li'));
        expect(first).toHaveTextContent(featured.name);
        expect(
            within(first as HTMLElement).getByRole('list', { name: 'Why this is result 1' })
        ).toHaveTextContent('Pinned to the top by rule featured-jacket');
        expect(
            within(second as HTMLElement).getByRole('list', { name: 'Why this is result 2' })
        ).toHaveTextContent(/"jacket" matched "jacket" in the name/);

        await user.click(screen.getByRole('button', { name: 'Explain ranking' }));
        await settled();
        expect(window.location.search).toBe('?q=jacket');
        expect(screen.queryByRole('list', { name: /Why this is result/ })).toBeNull();
    });

    it('says when a sort set the merchandising aside', async () => {
        const user = await open('?q=jacket');
        await settled();
        expect(cards()[0]?.closest('li')).toHaveTextContent(featured.name);
        expect(screen.queryByText(/sets aside the pins/)).toBeNull();
        await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-asc');
        await settled();
        // It names the rule and the way back, in the sort's own words.
        expect(screen.getByText(/sets aside the pins/)).toHaveTextContent(
            'The sort “Price, low to high” sets aside the pins, boosts and buries of the rule featured-jacket. Choose “Relevance” under “Sort by” to bring it back.'
        );
    });
});

describe('as a merchandiser', () => {
    const sku = (card: HTMLElement) => card.getAttribute('data-sku') ?? '';
    const explanation = (card: HTMLElement, rank: number) =>
        within(card.closest('li') as HTMLElement).getByRole('list', {
            name: `Why this is result ${rank}`,
        });

    it('previews a pin on the page while it is typed, then saves it as the store', async () => {
        const user = await open('?q=jacket');
        await settled();
        const before = cards().map(sku);
        const last = before[before.length - 1] ?? '';
        await user.click(screen.getByRole('button', { name: 'Rules' }));
        expect(window.location.search).toBe('?q=jacket&explain=1&rules=1');
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        expect(within(panel).getByRole('heading', { name: 'Rules for “jacket”' })).toBeVisible();
        expect(within(panel).getByRole('list', { name: 'Rules that apply' })).toHaveTextContent(
            'featured-jacket'
        );

        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(panel).getByRole('textbox', { name: 'Name' }), 'Last first');
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await settled();
        expect(screen.getByText(/Previewing a draft/)).toBeVisible();
        // Pinned in rule order: the store's pin first, then the draft's.
        const previewed = cards();
        expect(previewed.slice(0, 2).map(sku)).toEqual([featured.sku, last]);
        expect(explanation(previewed[1] as HTMLElement, 2)).toHaveTextContent(
            /Pinned to the top by rule jacket-/
        );
        // The store itself has not moved.
        expect((await fetch('http://store.test/rules').then((r) => r.json())).edited).toBe(false);

        await user.click(within(panel).getByRole('button', { name: 'Save rule' }));
        expect(await within(panel).findByRole('status')).toHaveTextContent(
            /Rule saved\. The store is now version rules\.[0-9a-f]+\./
        );
        await settled();
        expect(screen.queryByText(/Previewing a draft/)).toBeNull();
        expect(cards().slice(0, 2).map(sku)).toEqual([featured.sku, last]);
        expect(screen.getByText(/Your edited rules are in effect/)).toBeVisible();

        // Everything remembered was for the old store, so a fresh page says the same.
        await user.click(screen.getByRole('button', { name: 'Rules' }));
        await user.click(screen.getByRole('button', { name: 'Explain ranking' }));
        await settled();
        expect(cards().slice(0, 2).map(sku)).toEqual([featured.sku, last]);

        await user.click(screen.getByRole('button', { name: 'Discard your rules' }));
        await user.click(screen.getByRole('button', { name: 'Yes, discard' }));
        await waitFor(() =>
            expect(screen.queryByText(/Your edited rules are in effect/)).toBeNull()
        );
        await settled();
        expect(cards().map(sku)).toEqual(before);
    });

    it('tells the open panel when the banner gives the store its own rules back', async () => {
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = sku(cards()[cards().length - 1] as HTMLElement);
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await user.click(within(panel).getByRole('button', { name: 'Save rule' }));
        await within(panel).findByRole('status');
        const banner = screen.getByText(/Your edited rules are in effect/).closest('div');
        await user.click(
            within(banner as HTMLElement).getByRole('button', { name: 'Discard your rules' })
        );
        await user.click(
            within(banner as HTMLElement).getByRole('button', { name: 'Yes, discard' })
        );
        await waitFor(() =>
            expect(screen.queryByText(/Your edited rules are in effect/)).toBeNull()
        );
        await settled();
        await waitFor(() =>
            expect(within(panel).queryByRole('button', { name: 'Discard your rules' })).toBeNull()
        );
        expect(within(panel).getByRole('list', { name: 'Rules that apply' })).toHaveTextContent(
            'featured-jacket'
        );
        expect(within(panel).queryByRole('button', { name: 'Show every rule' })).toBeNull();
    });

    it('keeps the draft off the page once the panel closes', async () => {
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = sku(cards()[cards().length - 1] as HTMLElement);
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.click(within(panel).getByRole('radio', { name: /^Hide/ }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await settled();
        expect(cards().map(sku)).not.toContain(last);
        await user.click(within(panel).getByRole('button', { name: 'Cancel' }));
        await settled();
        expect(cards().map(sku)).toContain(last);
        await user.click(screen.getByRole('button', { name: 'Rules' }));
        expect(window.location.search).toBe('?q=jacket&explain=1');
        await waitFor(() =>
            expect(screen.queryByRole('complementary', { name: 'Rules' })).toBeNull()
        );
    });

    it('saves a hide rule, though the product it names has left the preview', async () => {
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = sku(cards()[cards().length - 1] as HTMLElement);
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.click(within(panel).getByRole('radio', { name: /^Hide/ }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await settled();
        expect(cards().map(sku)).not.toContain(last);
        await user.click(within(panel).getByRole('button', { name: 'Save rule' }));
        expect(await within(panel).findByRole('status')).toHaveTextContent(/Rule saved\./);
        await settled();
        expect(cards().map(sku)).not.toContain(last);
    });

    it('drops the draft with the panel when a new search closes it', async () => {
        const user = await open('?q=jacket&explain=1&rules=1');
        await settled();
        const last = sku(cards()[cards().length - 1] as HTMLElement);
        const panel = await screen.findByRole('complementary', { name: 'Rules' });
        await user.click(within(panel).getByRole('button', { name: 'Add a rule' }));
        await user.click(within(panel).getByRole('radio', { name: /^Hide/ }));
        await user.type(within(panel).getByRole('combobox', { name: 'Product' }), last);
        await settled();
        expect(screen.getByText(/Previewing a draft/)).toBeVisible();
        const box = screen.getByRole('combobox', { name: 'Search the store' });
        await user.clear(box);
        await user.type(box, 'boot{Enter}');
        await settled();
        expect(window.location.search).toBe('?q=boot&explain=1');
        await user.click(screen.getByRole('button', { name: 'Rules' }));
        await settled();
        expect(screen.queryByText(/Previewing a draft/)).toBeNull();
    });
});
