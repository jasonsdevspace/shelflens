import type { Rule } from '@jasonsdevspace/shelflens';
import { createMemoryRuleStore, receiveRules, VERSION_HEADER } from '@shelflens/api';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
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

/**
 * The page's side of the panel: a store revision that counts up on each
 * change the panel announces, as the page's own does, and once more for
 * every change made elsewhere.
 */
const Host = ({
    props,
    shown,
    elsewhere,
    onStoreChanged,
}: {
    readonly props: Partial<RulesPanelProps>;
    readonly shown: RulesPanelProps['products'];
    readonly elsewhere: number;
    readonly onStoreChanged: () => void;
}) => {
    const [announced, setAnnounced] = useState(0);
    const counted = useRef(0);
    const changed = () => {
        onStoreChanged();
        counted.current += 1;
        setAnnounced(counted.current);
        return counted.current + elsewhere;
    };
    return (
        <RulesPanel
            phrase="jacket"
            applied={['featured-jackets']}
            rulesUrl="http://store.test/rules"
            brands={brands}
            onDraft={() => undefined}
            byRelevance
            onSortByRelevance={() => undefined}
            {...props}
            products={shown}
            storeRevision={announced + elsewhere}
            onStoreChanged={changed}
        />
    );
};

const open = (props: Partial<RulesPanelProps> = {}) => {
    const onDraft = vi.fn();
    const onStoreChanged = vi.fn();
    const onSortByRelevance = vi.fn();
    const all = { onDraft, onSortByRelevance, ...props };
    const host = (shown: RulesPanelProps['products'], elsewhere = 0) => (
        <Host props={all} shown={shown} elsewhere={elsewhere} onStoreChanged={onStoreChanged} />
    );
    const shown = render(host(props.products ?? products));
    return {
        user: userEvent.setup(),
        onDraft,
        onStoreChanged,
        onSortByRelevance,
        rerender: (next: RulesPanelProps['products']) => shown.rerender(host(next)),
        /** The store was built again by something other than the panel. */
        storeBuiltAgain: (times: number) => shown.rerender(host(props.products ?? products, times)),
        unmount: shown.unmount,
    };
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
        open({ phrase: undefined, applied: [] });
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
            /The results have not shown a product with the SKU SL-9\. Choose one from the list\./
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
        // Whether it applies is the engine's word, which the next search brings. It is listed.
        await user.click(screen.getByRole('button', { name: 'Show every rule' }));
        expect(screen.getByRole('list', { name: 'Every rule' })).toHaveTextContent('Trail first');
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
            /The results have not shown a product with the SKU SL-404/
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
            applied: ['all-boots'],
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

    it('lists what the engine applied, not what the words suggest', async () => {
        // The engine stems "jackets" to "jacket" and applies the rule. The panel takes its word.
        open({ phrase: 'Jackets', applied: ['featured-jackets'] });
        expect(await screen.findByRole('list', { name: 'Rules that apply' })).toHaveTextContent(
            'Featured jackets'
        );
    });

    it('still names a product the preview has just hidden', async () => {
        const { user, onDraft, rerender } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.click(screen.getByRole('radio', { name: /^Hide/ }));
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-2');
        expect(onDraft.mock.lastCall?.[0]).toBeDefined();
        // The preview answers without SL-2, so the page no longer shows it.
        rerender(products.filter((product) => product.sku !== 'SL-2'));
        await user.click(screen.getByRole('button', { name: 'Save rule' }));
        expect(await screen.findByRole('status')).toHaveTextContent('Rule saved.');
        expect((await store.current())?.map((rule) => rule.hide)).toContainEqual(['SL-2']);
    });

    it('opens a saved hide rule whose product the page cannot show', async () => {
        const { user, onDraft } = open({ phrase: 'boots', applied: ['all-boots'], products: [] });
        await user.click(await screen.findByRole('button', { name: /all-boots/ }));
        await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Still hidden');
        const draft = onDraft.mock.lastCall?.[0] as Rule[];
        expect(draft.find((rule) => rule.id === 'all-boots')?.hide).toEqual(['SL-7']);
    });

    it('takes its draft with it when it closes', async () => {
        const { user, onDraft, unmount } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-2');
        expect(onDraft.mock.lastCall?.[0]).toBeDefined();
        unmount();
        expect(onDraft).toHaveBeenLastCalledWith(undefined);
    });

    it('edits nothing until the rules are read, and says when they cannot be', async () => {
        vi.stubGlobal('fetch', () => Promise.resolve(new Response('down', { status: 503 })));
        open();
        expect(await screen.findByRole('alert')).toHaveTextContent('The rules could not be read.');
        expect(screen.queryByRole('button', { name: 'Add a rule' })).toBeNull();
    });

    it('says when a save does not reach the host', async () => {
        const { user, onStoreChanged } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-2');
        vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
        await user.click(screen.getByRole('button', { name: 'Save rule' }));
        expect(await screen.findByRole('status')).toHaveTextContent(
            'The rules could not be saved. Try again.'
        );
        expect(onStoreChanged).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Save rule' })).toBeInTheDocument();
    });

    it('keeps the product’s name under the field once the preview has hidden it', async () => {
        const { user, rerender } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.click(screen.getByRole('radio', { name: /^Hide/ }));
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-2');
        rerender(products.filter((product) => product.sku !== 'SL-2'));
        expect(screen.getByRole('combobox', { name: 'Product' })).toHaveAccessibleDescription(
            /Trail Jacket/
        );
    });

    it('holds the set the host accepted without reading it back', async () => {
        const { user } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Trail first');
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-2');
        const live = fetch;
        vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
            init?.method === 'POST' ? live(input, init) : Promise.reject(new TypeError('offline'))
        );
        await user.click(screen.getByRole('button', { name: 'Save rule' }));
        expect(await screen.findByRole('status')).toHaveTextContent('Rule saved.');
        expect(screen.queryByRole('alert')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Show every rule' }));
        expect(screen.getByRole('list', { name: 'Every rule' })).toHaveTextContent('Trail first');
        expect((await store.current())?.map((rule) => rule.name)).toContain('Trail first');
    });

    it('says when the store’s rules could not be brought back', async () => {
        await store.replace([shipped[1] as (typeof shipped)[number]]);
        const { user, onStoreChanged } = open();
        await user.click(await screen.findByRole('button', { name: 'Use the store’s rules' }));
        vi.stubGlobal('fetch', () => Promise.resolve(new Response('down', { status: 503 })));
        await user.click(screen.getByRole('button', { name: 'Yes, discard' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The store’s rules could not be brought back. Try again.'
        );
        expect(onStoreChanged).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Use the store’s rules' })).toBeInTheDocument();
    });

    it('reads the rules again when the page, not the panel, built the store anew', async () => {
        await store.replace([shipped[1] as (typeof shipped)[number]]);
        const { storeBuiltAgain } = open();
        expect(
            await screen.findByRole('button', { name: 'Use the store’s rules' })
        ).toBeInTheDocument();
        // The banner above the page gave the store its own rules back.
        await store.reset();
        storeBuiltAgain(1);
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: 'Use the store’s rules' })).toBeNull()
        );
        expect(screen.getByRole('list', { name: 'Rules that apply' })).toHaveTextContent(
            'Featured jackets'
        );
    });

    it('treats a 200 that is not the rules as a failed read', async () => {
        vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ error: 'nope' })));
        open();
        expect(await screen.findByRole('alert')).toHaveTextContent('The rules could not be read.');
        expect(screen.queryByRole('button', { name: 'Add a rule' })).toBeNull();
    });

    it('refuses a save while the rules for a change made elsewhere are still being read', async () => {
        const { user, storeBuiltAgain, onStoreChanged } = open();
        await screen.findByRole('list', { name: 'Rules that apply' });
        await user.click(screen.getByRole('button', { name: 'Add a rule' }));
        await user.type(screen.getByRole('combobox', { name: 'Product' }), 'SL-2');
        // The page's banner reset the store, and the read it starts never lands.
        vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
        storeBuiltAgain(1);
        await user.click(screen.getByRole('button', { name: 'Save rule' }));
        expect(await screen.findByRole('status')).toHaveTextContent(
            'The rules are being read again. Try again in a moment.'
        );
        expect(onStoreChanged).not.toHaveBeenCalled();
        expect(await store.current()).toBeUndefined();
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
