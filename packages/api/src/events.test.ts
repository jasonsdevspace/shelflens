import { describe, expect, it } from 'vitest';

import {
    BATCH_LIMIT,
    createMemoryEventStore,
    type EventStore,
    GPC_HEADER,
    isEventsPath,
    parseEventBatch,
    receiveEvents,
    routeOf,
    type StoreEvent,
} from './events.js';

/*
 * The telemetry rules, at the receiver: a closed shape, a phrase that
 * cannot carry a record, one copy of each event, a bounded store, and
 * nothing kept when the browser says not to track.
 */

const event = (over: { [Key in keyof StoreEvent]?: StoreEvent[Key] | undefined } = {}) =>
    Object.fromEntries(
        Object.entries({
            id: 'e1',
            kind: 'search',
            at: 1_700_000_000_000,
            phrase: 'jacket',
            ...over,
        }).filter(([, value]) => value !== undefined)
    ) as unknown as StoreEvent;

const post = (body: unknown, headers: Record<string, string> = {}) => ({
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    header: (name: string) => headers[name],
});

describe('an event batch', () => {
    it('accepts the three kinds with their closed set of fields', () => {
        expect(
            parseEventBatch([
                event(),
                event({ id: 'e2', kind: 'click', sku: 'SL-00001', position: 3 }),
                event({
                    id: 'e3',
                    kind: 'view',
                    phrase: undefined,
                    sku: 'SL-00001',
                    session: 'tab',
                }),
            ])
        ).toEqual([
            { id: 'e1', kind: 'search', at: 1_700_000_000_000, phrase: 'jacket' },
            {
                id: 'e2',
                kind: 'click',
                at: 1_700_000_000_000,
                phrase: 'jacket',
                sku: 'SL-00001',
                position: 3,
            },
            { id: 'e3', kind: 'view', at: 1_700_000_000_000, sku: 'SL-00001', session: 'tab' },
        ]);
    });

    it('refuses the whole batch when any event carries a field it does not know', () => {
        expect(parseEventBatch([event(), { ...event({ id: 'e2' }), email: 'x@y.z' }])).toBe(
            undefined
        );
        expect(parseEventBatch([{ ...event(), userAgent: 'browser' }])).toBe(undefined);
    });

    it('refuses what is not a list of events', () => {
        expect(parseEventBatch({ id: 'e1' })).toBe(undefined);
        expect(parseEventBatch([event({ kind: 'purchase' as StoreEvent['kind'] })])).toBe(
            undefined
        );
        expect(parseEventBatch([event({ at: Number.NaN })])).toBe(undefined);
        expect(parseEventBatch([event({ id: '' })])).toBe(undefined);
        expect(parseEventBatch([event({ position: 0 })])).toBe(undefined);
        expect(parseEventBatch([event({ sku: 'x'.repeat(33) })])).toBe(undefined);
        expect(parseEventBatch([event({ session: 'x'.repeat(65) })])).toBe(undefined);
        expect(parseEventBatch([event({ session: '' })])).toBe(undefined);
        expect(parseEventBatch(Array.from({ length: BATCH_LIMIT + 1 }, () => event()))).toBe(
            undefined
        );
    });

    it('folds a phrase to a few lower case words and caps it', () => {
        const [folded] = parseEventBatch([event({ phrase: '  Trail   RUNNER\n' })]) ?? [];
        expect(folded?.phrase).toBe('trail runner');
        const [long] = parseEventBatch([event({ phrase: 'a'.repeat(200) })]) ?? [];
        expect(long?.phrase).toHaveLength(80);
        const [blank] = parseEventBatch([event({ phrase: '   ' })]) ?? [];
        expect(blank).toEqual({ id: 'e1', kind: 'search', at: 1_700_000_000_000 });
    });
});

describe('the memory store', () => {
    it('keeps each id once, oldest first, and lets the oldest go past its limit', async () => {
        const store = createMemoryEventStore({ limit: 3 });
        await store.append([event({ id: 'a', at: 3 }), event({ id: 'b', at: 1 })]);
        await store.append([event({ id: 'a', at: 3 }), event({ id: 'c', at: 2 })]);
        expect((await store.all()).map((e) => e.id)).toEqual(['b', 'c', 'a']);
        await store.append([event({ id: 'd', at: 4 })]);
        expect((await store.all()).map((e) => e.id)).toEqual(['c', 'a', 'd']);
        // An id that went can come back, since nothing remembers it.
        await store.append([event({ id: 'b', at: 9 })]);
        expect((await store.all()).map((e) => e.id)).toEqual(['a', 'd', 'b']);
    });
});

describe('the receiver', () => {
    const kept = async (store: EventStore) => (await store.all()).map((e) => e.id);

    it('keeps a posted batch and answers with nothing to say', async () => {
        const store = createMemoryEventStore();
        expect(await receiveEvents(post([event()]), store)).toEqual({ status: 204 });
        expect(await kept(store)).toEqual(['e1']);
    });

    it('keeps a batch delivered twice once', async () => {
        const store = createMemoryEventStore();
        await receiveEvents(post([event(), event({ id: 'e2' })]), store);
        await receiveEvents(post([event(), event({ id: 'e2' })]), store);
        expect(await kept(store)).toEqual(['e1', 'e2']);
    });

    it('brings a time ahead of its own back to when the batch arrived', async () => {
        const store = createMemoryEventStore();
        await receiveEvents(
            post([event({ at: 5_000 }), event({ id: 'e2', at: 500 })]),
            store,
            () => 1_000
        );
        expect((await store.all()).map((e) => [e.id, e.at])).toEqual([
            ['e2', 500],
            ['e1', 1_000],
        ]);
    });

    it('keeps nothing when the browser sends Global Privacy Control', async () => {
        const store = createMemoryEventStore();
        expect(await receiveEvents(post([event()], { [GPC_HEADER]: '1' }), store)).toEqual({
            status: 204,
        });
        expect(await kept(store)).toEqual([]);
    });

    it('refuses what is not a batch, and anything but a post', async () => {
        const store = createMemoryEventStore();
        expect((await receiveEvents(post('{'), store)).status).toBe(400);
        expect((await receiveEvents(post([{ id: 'x' }]), store)).status).toBe(400);
        expect((await receiveEvents({ ...post([event()]), method: 'GET' }, store)).status).toBe(
            405
        );
        expect(await kept(store)).toEqual([]);
    });
});

describe('the events path', () => {
    it('is events under the base, and nothing else', () => {
        expect(isEventsPath('/events')).toBe(true);
        expect(isEventsPath('https://example.test/shelflens/events', '/shelflens/')).toBe(true);
        expect(isEventsPath('/graphql')).toBe(false);
        expect(isEventsPath('/events', '/shelflens/')).toBe(false);
        expect(routeOf('/events')).toBe('events');
        expect(routeOf('https://example.test/shelflens/graphql?op=x', '/shelflens/')).toBe(
            'graphql'
        );
        expect(routeOf('/shelflens/catalog.json', '/shelflens/')).toBe(undefined);
    });
});
