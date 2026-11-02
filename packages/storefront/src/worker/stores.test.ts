import 'fake-indexeddb/auto';

import type { Rule } from '@jasonsdevspace/shelflens';
import {
    createMemoryEventStore,
    createMemoryRuleStore,
    type EventStore,
    type RuleStore,
    type StoreEvent,
} from '@shelflens/api';
import { describe, expect, it } from 'vitest';

import { createIndexedDbEventStore } from './event-db.js';
import { createIndexedDbRuleStore } from './rule-db.js';

/*
 * One set of cases for each kind of store, run against the one the Node
 * server and the tests use, in memory, and the one the demo runs on, in
 * IndexedDB. What a store promises is the same wherever it keeps things.
 */

let opened = 0;
/** A database of its own for each case, so no case sees another's events. */
const fresh = () => `shelflens-test-${String((opened += 1))}`;

const EVENT_STORES: readonly [string, (limit: number) => EventStore][] = [
    ['in memory', (limit) => createMemoryEventStore({ limit })],
    ['in IndexedDB', (limit) => createIndexedDbEventStore({ limit, name: fresh() })],
];

const view = (id: string, at: number): StoreEvent => ({
    id,
    kind: 'view',
    at,
    sku: `SL-${id}`,
    session: 'tab-1',
});

describe.each(EVENT_STORES)('an event store %s', (_where, create) => {
    it('keeps an event delivered twice once', async () => {
        const store = create(10);
        await store.append([view('a', 1), view('b', 2)]);
        await store.append([view('a', 1)]);
        expect((await store.all()).map((event) => event.id)).toEqual(['a', 'b']);
    });

    it('keeps the first copy of an id, however it is sent again', async () => {
        const store = create(10);
        await store.append([view('a', 1), { ...view('a', 99), sku: 'SL-other' }]);
        await store.append([{ ...view('a', 50), sku: 'SL-later' }, view('b', 2)]);
        expect(await store.all()).toEqual([view('a', 1), view('b', 2)]);
    });

    it('orders events given at the same time by their id, and trims them in that order', async () => {
        const store = create(2);
        await store.append([view('z', 5), view('a', 5)]);
        expect((await store.all()).map((event) => event.id)).toEqual(['a', 'z']);
        await store.append([view('m', 6)]);
        expect((await store.all()).map((event) => event.id)).toEqual(['z', 'm']);
    });

    it('gives its events back oldest first, by the time the page gave them', async () => {
        const store = create(10);
        await store.append([view('late', 30), view('early', 10)]);
        await store.append([view('middle', 20)]);
        expect((await store.all()).map((event) => event.id)).toEqual(['early', 'middle', 'late']);
    });

    it('lets the oldest go past its limit, even one that arrived last', async () => {
        const store = create(3);
        await store.append([view('b', 20), view('c', 30), view('d', 40)]);
        // Sent late but given early, as a beacon from a page left open does.
        await store.append([view('a', 10)]);
        expect((await store.all()).map((event) => event.id)).toEqual(['b', 'c', 'd']);
        await store.append([view('e', 50)]);
        expect((await store.all()).map((event) => event.id)).toEqual(['c', 'd', 'e']);
    });
});

const RULE_STORES: readonly [string, () => RuleStore][] = [
    ['in memory', () => createMemoryRuleStore()],
    ['in IndexedDB', () => createIndexedDbRuleStore(fresh())],
];

const rules: readonly Rule[] = [{ id: 'mine', when: { queries: ['jacket'] }, pin: ['SL-00001'] }];

describe.each(RULE_STORES)('a rule store %s', (_where, create) => {
    it('has nothing until a set is saved, gives the set back, and forgets it on reset', async () => {
        const store = create();
        expect(await store.current()).toBeUndefined();
        await store.replace(rules);
        expect(await store.current()).toEqual(rules);
        await store.replace([]);
        expect(await store.current()).toEqual([]);
        await store.reset();
        expect(await store.current()).toBeUndefined();
    });
});

describe('the stores the demo runs on', () => {
    it('keep what was saved for the next worker, which starts with nothing in memory', async () => {
        const name = fresh();
        await createIndexedDbRuleStore(name).replace(rules);
        expect(await createIndexedDbRuleStore(name).current()).toEqual(rules);
        const events = fresh();
        await createIndexedDbEventStore({ name: events }).append([view('a', 1)]);
        expect(
            (await createIndexedDbEventStore({ name: events }).all()).map((event) => event.id)
        ).toEqual(['a']);
    });
});
