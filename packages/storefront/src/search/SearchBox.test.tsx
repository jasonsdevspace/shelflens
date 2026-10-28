import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClient, type GraphQLClient } from '../client/graphql.js';
import type { SuggestQuery } from '../generated/operations.js';
import { SearchBox } from './SearchBox.jsx';
import { DEBOUNCE_MS } from './useSuggestions.js';

/*
 * The popover against a network that behaves badly on purpose.
 *
 * The shim records every request and lets a test answer them in any order,
 * which is how the stale-response test proves the right answer wins.
 */

type Suggestions = SuggestQuery['suggest'];

interface Pending {
    readonly phrase: string;
    readonly signal: AbortSignal | undefined;
    answer(suggestions: Suggestions): void;
}

const product = (sku: string, name: string): Suggestions['products'][number] => ({
    product: {
        sku,
        name,
        colors: ['Navy'],
        brand: { name: 'Ostara' },
        price: {
            min: { amount: 4900, currency: 'USD' },
            max: { amount: 5900, currency: 'USD' },
        },
    },
});

const suggestionsFor = (phrase: string): Suggestions => ({
    queries: [`${phrase} runner`, `${phrase} jacket`],
    products: [product(`${phrase}-1`, `${phrase} one`), product(`${phrase}-2`, `${phrase} two`)],
});

const createNetwork = () => {
    const pending: Pending[] = [];
    const fetchImpl: typeof fetch = (url, init) =>
        new Promise((resolve, reject) => {
            // The client names the operation in a GET, with the variables in the URL.
            const encoded = new URL(
                typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
                'http://local'
            ).searchParams.get('variables');
            const variables = JSON.parse(encoded ?? '{}') as { phrase: string };
            const signal = init?.signal ?? undefined;
            signal?.addEventListener('abort', () => reject(new Error('aborted')));
            pending.push({
                phrase: variables.phrase,
                signal,
                answer: (suggest) =>
                    resolve(
                        new Response(JSON.stringify({ data: { suggest } }), {
                            status: 200,
                            headers: { 'content-type': 'application/json' },
                        })
                    ),
            });
        });
    return { pending, client: createClient({ url: '/graphql', fetch: fetchImpl }) };
};

const renderBox = (client: GraphQLClient) => {
    const onSearch = vi.fn();
    const onPick = vi.fn();
    render(<SearchBox client={client} onSearch={onSearch} onPick={onPick} />);
    return { onSearch, onPick, input: screen.getByRole('combobox') };
};

describe('the popover under real typing', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    /* Keystrokes as change events, so the fake clock is the only clock. */
    const typeQuickly = (input: HTMLElement, phrase: string) => {
        for (let length = 1; length <= phrase.length; length += 1) {
            fireEvent.change(input, { target: { value: phrase.slice(0, length) } });
        }
    };

    const settle = () => act(() => vi.advanceTimersByTimeAsync(DEBOUNCE_MS));

    it('sends one request for a burst of keystrokes, after the pause', async () => {
        const network = createNetwork();
        const { input } = renderBox(network.client);

        typeQuickly(input, 'trail');
        expect(network.pending).toHaveLength(0);

        await settle();
        expect(network.pending.map((p) => p.phrase)).toEqual(['trail']);
    });

    it('asks nothing for a single character', async () => {
        const network = createNetwork();
        const { input } = renderBox(network.client);
        typeQuickly(input, 't');
        await settle();
        await settle();
        expect(network.pending).toHaveLength(0);
    });

    it('shows the answer to the newest phrase even when an older answer arrives later', async () => {
        const network = createNetwork();
        const { input } = renderBox(network.client);

        typeQuickly(input, 'tr');
        await settle();
        typeQuickly(input, 'trail');
        await settle();
        expect(network.pending.map((p) => p.phrase)).toEqual(['tr', 'trail']);
        expect(network.pending[0]?.signal?.aborted).toBe(true);

        await act(async () => {
            network.pending[1]?.answer(suggestionsFor('trail'));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByRole('option', { name: 'trail runner' })).toBeVisible();

        // The slow answer to "tr" lands after. Nothing may change.
        await act(async () => {
            network.pending[0]?.answer(suggestionsFor('tr'));
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.queryByRole('option', { name: 'tr runner' })).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'trail runner' })).toBeVisible();
    });
});

describe('the popover as a combobox', () => {
    const openWith = async (phrase: string) => {
        const network = createNetwork();
        const box = renderBox(network.client);
        const user = userEvent.setup();
        await user.type(box.input, phrase);
        await waitFor(() => expect(network.pending).toHaveLength(1));
        network.pending[0]?.answer(suggestionsFor(phrase));
        await waitFor(() => expect(box.input).toHaveAttribute('aria-expanded', 'true'));
        return { ...box, user, network };
    };

    it('is a combobox controlling a listbox of options, and passes an accessibility audit', async () => {
        const { input } = await openWith('trail');
        const listbox = screen.getByRole('listbox', { name: 'Suggestions' });
        expect(input).toHaveAttribute('aria-controls', listbox.id);
        expect(input).toHaveAttribute('aria-autocomplete', 'list');
        expect(screen.getAllByRole('option')).toHaveLength(4);
        expect(screen.getByRole('status')).toHaveTextContent('4 suggestions');

        const audit = await axe.run(document.body, {
            // Landmarks are the page's job, and jsdom cannot compute contrast.
            rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
        });
        expect(audit.violations).toEqual([]);
    });

    it('moves the highlight with the arrow keys and announces it through aria-activedescendant', async () => {
        const { input, user } = await openWith('trail');
        expect(input).not.toHaveAttribute('aria-activedescendant');

        await user.keyboard('{ArrowDown}');
        const first = screen.getByRole('option', { name: 'trail runner' });
        expect(input).toHaveAttribute('aria-activedescendant', first.id);
        expect(first).toHaveAttribute('aria-selected', 'true');

        await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
        const last = screen.getByRole('option', { name: /trail two/ });
        expect(input).toHaveAttribute('aria-activedescendant', last.id);

        await user.keyboard('{ArrowDown}');
        expect(input).not.toHaveAttribute('aria-activedescendant');

        await user.keyboard('{ArrowUp}');
        expect(input).toHaveAttribute('aria-activedescendant', last.id);
    });

    it('searches the highlighted query on Enter, and the typed phrase when nothing is highlighted', async () => {
        const { input, user, onSearch } = await openWith('trail');
        await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
        expect(onSearch).toHaveBeenCalledWith('trail jacket');
        expect(input).toHaveValue('trail jacket');
        expect(input).toHaveAttribute('aria-expanded', 'false');

        await user.clear(input);
        await user.type(input, 'boots{Enter}');
        expect(onSearch).toHaveBeenLastCalledWith('boots');
    });

    it('picks a product with Enter or a click', async () => {
        const { user, onPick } = await openWith('trail');
        await user.keyboard('{ArrowUp}{Enter}');
        expect(onPick).toHaveBeenCalledWith('trail-2');

        await user.keyboard('{ArrowDown}');
        await user.click(screen.getByRole('option', { name: /trail one/ }));
        expect(onPick).toHaveBeenLastCalledWith('trail-1');
    });

    it('closes on Escape and keeps the phrase', async () => {
        const { input, user } = await openWith('trail');
        await user.keyboard('{Escape}');
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(input).toHaveValue('trail');
        expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('shows the product with its thumbnail, brand and price', async () => {
        await openWith('trail');
        const option = screen.getByRole('option', { name: /trail one/ });
        expect(option).toHaveTextContent('Ostara');
        expect(option).toHaveTextContent('$49 to $59');
        expect(option.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });
});
