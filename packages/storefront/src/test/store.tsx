import { createMemoryEventStore, createMemoryRuleStore } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';

import { App } from '../App.jsx';
import { createWorkerApi } from '../worker/handle.js';
import { serving } from '../worker/serving.js';

/*
 * The store the App tests run against, and what they share. Each file of
 * them imports this, which registers the hooks below in that file.
 *
 * The storefront end to end, in a document, over the real API.
 *
 * Nothing is mocked but the network: fetch is routed to the same worker
 * handler the service worker runs, over a generated catalog. So the facet
 * counts, the sort fallbacks and the pages are the real ones, and a test
 * here fails when the API and the page disagree.
 */

export const catalog = generateCatalog({ seed: 42, products: 300 });
export const jackets = catalog.products.filter((p) => /jacket/i.test(p.name));
const lastJacket = jackets[jackets.length - 1];
if (!lastJacket) throw new Error('expected a jacket in the catalog');
/** The jacket the one rule pins. */
export const featured = lastJacket;
/** One rule, so explain mode has a pin to show and a price sort has something to set aside. */
const rules = [{ id: 'featured-jacket', when: { queries: ['jacket'] }, pin: [featured.sku] }];

let events = createMemoryEventStore();
let savedRules = createMemoryRuleStore();

beforeAll(() => {
    const worker = createWorkerApi({
        catalogUrl: 'catalog.json',
        rulesUrl: 'rules.json',
        fetch: serving(catalog, { rules }),
        // The same store the API reads, replaced before each test, so no test
        // sees what another viewed.
        events: {
            append: (batch) => events.append(batch),
            all: () => events.all(),
        },
        rules: {
            current: () => savedRules.current(),
            replace: (rules) => savedRules.replace(rules),
            reset: () => savedRules.reset(),
        },
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await worker.handle(new Request(input, init));
        return response ?? new Response('not found', { status: 404 });
    });
});

beforeEach(() => {
    events = createMemoryEventStore();
    savedRules = createMemoryRuleStore();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    // The tour opens itself on a first visit. These tests are not that visit.
    localStorage.setItem('shelflens.tour', 'seen');
});

afterEach(() => {
    vi.restoreAllMocks();
});

export const open = async (search = '') => {
    window.history.replaceState(null, '', `/${search}`);
    render(
        <App
            apiUrl="http://store.test/graphql"
            eventsUrl="http://store.test/events"
            rulesUrl="http://store.test/rules"
            ready={Promise.resolve()}
        />
    );
    await screen.findByRole('heading', { level: 1 });
    return userEvent.setup();
};

export const heading = () => screen.getByRole('heading', { level: 1 });
export const cards = () =>
    within(screen.getByRole('list', { name: 'Products' })).getAllByRole('link');
export const facet = (title: string) => screen.getByRole('group', { name: title });
export const amount = (text: string | null | undefined) =>
    Number(/\d+(?:\.\d+)?/.exec((text ?? '').replace(/,/g, ''))?.[0]);
export const shownPrice = () => amount(document.querySelector('.product-price')?.textContent);
export const shopAs = (user: ReturnType<typeof userEvent.setup>, group: 'guest' | 'member') =>
    user.selectOptions(screen.getByRole('combobox', { name: 'Shopping as' }), group);

export const settled = () =>
    waitFor(() =>
        expect(document.querySelector('.results-layout')).not.toHaveAttribute('aria-busy', 'true')
    );
