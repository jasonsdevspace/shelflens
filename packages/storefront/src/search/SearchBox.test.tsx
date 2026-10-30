import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClient, type GraphQLClient } from '../client/graphql.js';
import type { SuggestQuery } from '../generated/operations.js';
import { clearRecentSearches, rememberSearch } from './recent.js';
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
    fail(message: string): void;
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
                fail: (message) => reject(new Error(message)),
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

describe('what this browser searched before', () => {
    beforeEach(() => {
        localStorage.clear();
        clearRecentSearches();
    });

    const openEmpty = async () => {
        const network = createNetwork();
        const box = renderBox(network.client);
        const user = userEvent.setup();
        await user.click(box.input);
        return { ...box, user, network };
    };

    it('offers the recent phrases on focus, under a heading the eye and the screen reader share', async () => {
        rememberSearch('boots');
        rememberSearch('trail runner');
        const { input } = await openEmpty();
        const listbox = screen.getByRole('listbox', { name: 'Recent searches' });
        expect(screen.getByText('Recent searches')).toBeVisible();
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'trail runner',
            'boots',
        ]);
        expect(screen.getByRole('status')).toHaveTextContent('2 recent searches');
        expect(input).toHaveAttribute('aria-controls', listbox.id);
        const audit = await axe.run(document.body, {
            rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
        });
        expect(audit.violations).toEqual([]);
    });

    it('opens nothing when nothing was searched before', async () => {
        const { input } = await openEmpty();
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Recent searches')).toBeNull();
        expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('filters the recent phrases by what is typed, from the first character', async () => {
        rememberSearch('boots');
        rememberSearch('trail runner');
        const { input, user, network } = await openEmpty();
        await user.type(input, 'r');
        expect(network.pending).toHaveLength(0);
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'trail runner',
        ]);
        expect(screen.getByRole('status')).toHaveTextContent('1 recent search');
        await user.clear(input);
        await user.type(input, 'x');
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('keeps matching recent phrases above the suggestions, in groups, and never twice', async () => {
        rememberSearch('trail jacket');
        rememberSearch('trail runner');
        const network = createNetwork();
        const box = renderBox(network.client);
        const user = userEvent.setup();
        await user.type(box.input, 'trail');
        await waitFor(() => expect(network.pending).toHaveLength(1));
        network.pending[0]?.answer(suggestionsFor('trail'));
        await waitFor(() =>
            expect(screen.getByRole('listbox', { name: 'Suggestions' })).toBeVisible()
        );
        expect(screen.getByRole('group', { name: 'Recent searches' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Suggestions' })).toBeInTheDocument();
        const names = screen
            .getAllByRole('option')
            .map((option) => option.querySelector('.searchbox-query, .searchbox-product-name'));
        expect(names.map((name) => name?.textContent)).toEqual([
            'trail runner',
            'trail jacket',
            'trail one',
            'trail two',
        ]);
        // The heading and its clear button stay with the shopper's phrases wherever they sit.
        expect(screen.getByRole('button', { name: 'Clear recent searches' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('2 recent searches and 2 suggestions');
        await user.keyboard('{ArrowDown}{Enter}');
        expect(box.onSearch).toHaveBeenCalledWith('trail runner');
    });

    it('keeps the recent phrases, and no empty group, when the store has nothing to add', async () => {
        rememberSearch('gift card');
        const network = createNetwork();
        const box = renderBox(network.client);
        const user = userEvent.setup();
        await user.type(box.input, 'gi');
        await waitFor(() => expect(network.pending).toHaveLength(1));
        network.pending[0]?.answer({ queries: [], products: [] });
        await waitFor(() =>
            expect(screen.getByRole('status')).toHaveTextContent('1 recent search')
        );
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'gift card',
        ]);
        expect(screen.queryByRole('group', { name: 'Suggestions' })).toBeNull();
        expect(screen.getByRole('listbox', { name: 'Recent searches' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Clear recent searches' })).toBeInTheDocument();
    });

    it('starts the highlight over when the store\u2019s answer re-cuts the list', async () => {
        for (const phrase of [
            'trail map',
            'trail shoes',
            'trail mix',
            'trail jacket',
            'trail runner',
        ]) {
            rememberSearch(phrase);
        }
        const network = createNetwork();
        const box = renderBox(network.client);
        const user = userEvent.setup();
        await user.type(box.input, 'tr');
        // Three at most once the store is asked, so the answer never cuts the list shorter.
        expect(screen.getAllByRole('option')).toHaveLength(3);
        await user.keyboard('{ArrowDown}{ArrowDown}');
        expect(box.input).toHaveAttribute(
            'aria-activedescendant',
            expect.stringContaining('option-1')
        );
        await waitFor(() => expect(network.pending).toHaveLength(1));
        network.pending[0]?.answer({ queries: ['trek poles'], products: [] });
        await waitFor(() =>
            expect(screen.getByRole('status')).toHaveTextContent(
                '3 recent searches and 1 suggestion'
            )
        );
        expect(box.input).not.toHaveAttribute('aria-activedescendant');
        await user.keyboard('{Enter}');
        expect(box.onSearch).toHaveBeenCalledWith('tr');
    });

    it('drops the highlight with Escape on the clear button, so Enter submits what is typed', async () => {
        rememberSearch('boots');
        const { input, user, onSearch } = await openEmpty();
        await user.keyboard('{ArrowDown}');
        await user.tab();
        await user.keyboard('{Escape}');
        expect(input).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(onSearch).not.toHaveBeenCalled();
    });

    it('says a failed request even while recent phrases match', async () => {
        rememberSearch('boots');
        const network = createNetwork();
        const box = renderBox(network.client);
        const user = userEvent.setup();
        await user.type(box.input, 'bo');
        await waitFor(() => expect(network.pending).toHaveLength(1));
        network.pending[0]?.fail('the network is down');
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('down'));
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'boots',
        ]);
        // The failure was for "bo". "boo" is a new request, not a failed one.
        await user.type(box.input, 'o');
        expect(screen.getByRole('status')).toHaveTextContent('Searching');
    });

    it('names the list for the store while the store is asked and no recent phrase matches', async () => {
        rememberSearch('boots');
        const network = createNetwork();
        const box = renderBox(network.client);
        const user = userEvent.setup();
        await user.type(box.input, 'zz');
        expect(box.input).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('listbox', { name: 'Suggestions' })).toBeInTheDocument();
    });

    it('says when storage refused to let the list go', async () => {
        rememberSearch('boots');
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('refused');
        });
        const { input, user } = await openEmpty();
        await user.tab();
        await user.keyboard('{Enter}');
        expect(input).toHaveFocus();
        expect(screen.getByRole('status')).toHaveTextContent(
            'The recent searches could not be cleared.'
        );
        vi.restoreAllMocks();
    });

    it('shows a phrase once however the store spaces its suggestion of it', async () => {
        rememberSearch('trail runner');
        const network = createNetwork();
        const box = renderBox(network.client);
        const user = userEvent.setup();
        await user.type(box.input, 'trail');
        await waitFor(() => expect(network.pending).toHaveLength(1));
        network.pending[0]?.answer({ queries: ['trail  runner', 'trail jacket'], products: [] });
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 suggestion'));
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'trail runner',
            'trail jacket',
        ]);
    });

    it('clears from a button reached by Tab, says so, and puts focus back in the box', async () => {
        rememberSearch('boots');
        const { input, user } = await openEmpty();
        await user.tab();
        const clear = screen.getByRole('button', { name: 'Clear recent searches' });
        expect(clear).toHaveFocus();
        expect(input).toHaveAttribute('aria-expanded', 'true');
        await user.keyboard('{Enter}');
        expect(input).toHaveFocus();
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('status')).toHaveTextContent('Recent searches cleared');
        expect(localStorage.getItem('shelflens.recent')).toBeNull();
        await user.type(input, 'b');
        expect(screen.getByRole('status')).toHaveTextContent('');
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('never clears from the arrow keys: the last option is a phrase', async () => {
        rememberSearch('boots');
        const { user, onSearch } = await openEmpty();
        await user.keyboard('{ArrowUp}{Enter}');
        expect(onSearch).toHaveBeenCalledWith('boots');
        expect(localStorage.getItem('shelflens.recent')).not.toBeNull();
    });

    it('closes on Escape from the clear button, with focus back in the box', async () => {
        rememberSearch('boots');
        const { input, user } = await openEmpty();
        await user.tab();
        await user.keyboard('{Escape}');
        expect(input).toHaveFocus();
        expect(input).toHaveAttribute('aria-expanded', 'false');
    });
});

describe('the box inside a shadow root', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('scrolls the highlighted option into view through its own tree', async () => {
        const host = document.createElement('div');
        document.body.append(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const container = document.createElement('div');
        shadow.append(container);
        const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
        const network = createNetwork();
        const onSearch = vi.fn();
        render(<SearchBox client={network.client} onSearch={onSearch} onPick={vi.fn()} />, {
            container,
        });
        // A simulated user types at the document, which does not see into the shadow
        // tree, so the keystrokes go to the box as events.
        const input = within(container).getByRole('combobox');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'trail' } });
        await waitFor(() => expect(network.pending).toHaveLength(1));
        network.pending[0]?.answer(suggestionsFor('trail'));
        await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        const second = within(container).getAllByRole('option')[1];
        expect(scrolled).toHaveBeenCalled();
        expect(scrolled.mock.instances[scrolled.mock.instances.length - 1]).toBe(second);
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSearch).toHaveBeenCalledWith('trail jacket');
        host.remove();
    });
});
