import type { Rule } from '@jasonsdevspace/shelflens';
import { createMemoryRuleStore, receiveRules, VERSION_HEADER } from '@shelflens/api';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RulesPanel, type RulesPanelProps } from './RulesPanel.jsx';

/*
 * The panel on its own, over the rules path of a small host: the shipped
 * rules, a memory store for the saved set, and a check that refuses one
 * SKU the way the engine would.
 */

const shipped = [
    {
        id: 'featured-jackets',
        name: 'Featured jackets',
        when: { queries: ['jacket'] },
        pin: ['SL-1'],
    },
    {
        id: 'all-boots',
        when: { queries: ['boot', 'boots'], filter: { attribute: 'category', value: 'boots' } },
        active: { from: '2024-01-01' },
        hide: ['SL-7'],
    },
];
const products = [
    { sku: 'SL-1', name: 'Ridge Jacket' },
    { sku: 'SL-2', name: 'Trail Jacket' },
    { sku: 'SL-3', name: 'Rain Jacket' },
];
const brands = ['Ridgeback', 'Northline'];

let store = createMemoryRuleStore();
let posted: unknown[] = [];

beforeEach(() => {
    store = createMemoryRuleStore();
    posted = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const body = request.method === 'POST' ? await request.text() : undefined;
        if (body) posted.push(JSON.parse(body));
        const receipt = await receiveRules({ method: request.method, body }, store, {
            shipped,
            check: (rules) => {
                for (const rule of rules) {
                    if (rule.pin?.includes('SL-404'))
                        throw new Error('no product has the SKU SL-404');
                }
            },
        });
        if (receipt.status === 200) return Response.json(receipt.body);
        if (receipt.status === 204) {
            return new Response(null, {
                status: 204,
                headers: receipt.changed ? { [VERSION_HEADER]: 'cat+rules.abcd' } : {},
            });
        }
        return Response.json(
            { errors: [{ message: receipt.message }] },
            { status: receipt.status }
        );
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const open = (props: Partial<RulesPanelProps> = {}) => {
    const onDraft = vi.fn();
    const onStoreChanged = vi.fn();
    const onSortByRelevance = vi.fn();
    render(
        <RulesPanel
            phrase="jacket"
            rulesUrl="http://store.test/rules"
            products={products}
            brands={brands}
            onDraft={onDraft}
            onStoreChanged={onStoreChanged}
            byRelevance
            onSortByRelevance={onSortByRelevance}
            {...props}
        />
    );
    return { user: userEvent.setup(), onDraft, onStoreChanged, onSortByRelevance };
};

describe('the rules panel', () => {
    it('lists the rules that fire on the search, with every rule a press away', async () => {
        const { user } = open();
        const applying = await screen.findByRole('list', { name: 'Rules that apply' });
        expect(within(applying).getAllByRole('button')).toHaveLength(1);
        expect(applying).toHaveTextContent('Featured jackets');
        expect(applying).toHaveTextContent('Pins 1 product');
        await user.click(screen.getByRole('button', { name: 'Show every rule' }));
        const every = screen.getByRole('list', { name: 'Every rule' });
        expect(within(every).getAllByRole('button')).toHaveLength(2);
        expect(every).toHaveTextContent('Hides 1 product');
    });

    it('says a search is needed before any rule can apply', async () => {
        open({ phrase: undefined });
        expect(await screen.findByText(/A rule applies to a search/)).toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Rules that apply' })).toBeNull();
    });

    it('offers the way back to relevance when a sort has set the rules aside', async () => {
        const { user, onSortByRelevance } = open({ byRelevance: false });
        await user.click(await screen.findByRole('button', { name: 'Sort by relevance' }));
        expect(onSortByRelevance).toHaveBeenCalled();
    });

    it('hands up a draft of the whole set as soon as the new rule is sound', async () => {
        const { user, onDraft } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        expect(screen.getByRole('textbox', { name: 'Search words' })).toHaveValue('jacket');
        // Nothing yet: the rule names no product.
        expect(onDraft).toHaveBeenLastCalledWith(undefined);
        await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Trail first');
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-2');
        const draft = onDraft.mock.lastCall?.[0] as { id: string; pin?: string[] }[];
        expect(draft.map((rule) => rule.id)).toEqual([
            'featured-jackets',
            'all-boots',
            expect.stringMatching(/^jacket-/),
        ]);
        expect(draft[2]).toMatchObject({ name: 'Trail first', pin: ['SL-2'] });
        expect(screen.getByRole('combobox', { name: 'Product' })).toHaveAccessibleDescription(
            /Trail Jacket/
        );
    });

    it('describes a boost by brand with the weight its step means', async () => {
        const { user, onDraft } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.click(screen.getByRole('radio', { name: /^Boost/ }));
        await user.selectOptions(screen.getByRole('combobox', { name: 'On' }), 'brand');
        await user.selectOptions(screen.getByRole('combobox', { name: 'Brand' }), 'Northline');
        await user.selectOptions(screen.getByRole('combobox', { name: 'How much' }), '2');
        const draft = onDraft.mock.lastCall?.[0] as { boost?: unknown[] }[];
        expect(draft[2]?.boost).toEqual([
            { attribute: { name: 'brand', value: 'Northline' }, weight: 2 },
        ]);
    });

    it('says what is missing under the field, once a save is tried, and puts focus there', async () => {
        const { user, onDraft } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.clear(screen.getByRole('textbox', { name: 'Search words' }));
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-9');
        expect(screen.queryByText(/No product on this page/)).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Save rule' }));
        expect(screen.getByRole('textbox', { name: 'Search words' })).toHaveFocus();
        expect(screen.getByRole('textbox', { name: 'Search words' })).toHaveAccessibleDescription(
            'Say which searches this rule applies to, like jacket, jackets.'
        );
        expect(screen.getByRole('combobox', { name: 'Product' })).toHaveAccessibleDescription(
            /No product on this page has the SKU SL-9\. Choose one from the list\./
        );
        expect(posted).toEqual([]);
        expect(onDraft).toHaveBeenLastCalledWith(undefined);
    });

    it('saves the set, says the new store version, and lists the saved rule', async () => {
        const { user, onStoreChanged } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Trail first');
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-2');
        await user.click(screen.getByRole('button', { name: 'Save rule' }));
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Rule saved. The store is now version rules.abcd.'
        );
        expect(onStoreChanged).toHaveBeenCalledTimes(1);
        expect(posted).toHaveLength(1);
        expect(await store.current()).toHaveLength(3);
        const applying = screen.getByRole('list', { name: 'Rules that apply' });
        expect(applying).toHaveTextContent('Trail first');
        expect(screen.getByRole('button', { name: 'Use the store’s rules' })).toBeInTheDocument();
    });

    it('repeats the host’s refusal and keeps the form open', async () => {
        const { user, onStoreChanged } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-404');
        // The panel trusts its own list first, so the SKU has to be on the page.
        expect(screen.getByRole('combobox', { name: 'Product' })).toHaveValue('SL-404');
        await user.click(screen.getByRole('button', { name: 'Save rule' }));
        expect(screen.getByRole('combobox', { name: 'Product' })).toHaveAccessibleDescription(
            /No product on this page has the SKU SL-404/
        );
        expect(onStoreChanged).not.toHaveBeenCalled();
    });

    it('edits an existing rule in place and removes it', async () => {
        const { user, onDraft, onStoreChanged } = open();
        await user.click(await screen.findByRole('button', { name: /Featured jackets/ }));
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Featured jackets');
        expect(screen.getByRole('radio', { name: /^Pin/ })).toBeChecked();
        expect(screen.getByRole('combobox', { name: 'Product' })).toHaveValue('SL-1');
        await user.click(screen.getByRole('button', { name: 'Add another product' }));
        await user.type(screen.getByRole('combobox', { name: 'Another product' }), 'SL-3');
        const draft = onDraft.mock.lastCall?.[0] as { id: string; pin?: string[] }[];
        expect(draft.map((rule) => rule.id)).toEqual(['all-boots', 'featured-jackets']);
        expect(draft[1]?.pin).toEqual(['SL-1', 'SL-3']);

        await user.click(screen.getByRole('button', { name: 'Remove rule' }));
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Rule removed. The store is now version'
        );
        expect((await store.current())?.map((rule) => rule.id)).toEqual(['all-boots']);
        expect(onStoreChanged).toHaveBeenCalledTimes(1);
        expect(screen.getByText('No rule applies to “jacket”.')).toBeInTheDocument();
    });

    it('keeps the parts of a rule it cannot edit, and says so', async () => {
        const { user, onDraft } = open({
            phrase: 'boots',
            products: [{ sku: 'SL-7', name: 'Mud Boot' }],
        });
        await user.click(await screen.findByRole('button', { name: /all-boots/ }));
        expect(
            screen.getByText(
                'This rule also applies only with the category "boots" ticked, from 2024-01-01, which stays as it is.'
            )
        ).toBeInTheDocument();
        await user.type(screen.getByRole('textbox', { name: 'Name' }), 'No boots');
        const draft = onDraft.mock.lastCall?.[0] as Rule[];
        expect(draft.find((rule) => rule.id === 'all-boots')).toEqual({
            id: 'all-boots',
            name: 'No boots',
            when: { queries: ['boot', 'boots'], filter: { attribute: 'category', value: 'boots' } },
            active: { from: '2024-01-01' },
            hide: ['SL-7'],
        });
    });

    it('gives the store’s own rules back only after a second press', async () => {
        await store.replace([shipped[1] as (typeof shipped)[number]]);
        const { user, onStoreChanged } = open();
        await user.click(await screen.findByRole('button', { name: 'Use the store’s rules' }));
        expect(screen.getByText(/Discard your rules\?/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Keep them' }));
        expect(await store.current()).toHaveLength(1);
        expect(onStoreChanged).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Use the store’s rules' }));
        await user.click(screen.getByRole('button', { name: 'Yes, discard' }));
        await waitFor(() => expect(onStoreChanged).toHaveBeenCalledTimes(1));
        expect(await store.current()).toBeUndefined();
        expect(screen.getByRole('status')).toHaveTextContent('The store’s own rules are back.');
        expect(screen.getByRole('list', { name: 'Rules that apply' })).toHaveTextContent(
            'Featured jackets'
        );
        expect(screen.queryByRole('button', { name: 'Use the store’s rules' })).toBeNull();
    });
});
