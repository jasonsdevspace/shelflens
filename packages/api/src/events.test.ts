import { describe, expect, it } from 'vitest';

import {
    BATCH_LIMIT,
    createMemoryEventStore,
    type EventStore,
    GPC_HEADER,
    parseEventBatch,
    receiveEvents,
    type StoreEvent,
} from './events.js';

/*
 * The telemetry rules, at the receiver: a closed shape, a phrase that
 * cannot carry a record, one copy of each event, a bounded store, and
 * nothing kept when the browser says not to track.
 */

/** An event as a page would send it, with any field changed or left out, for the store to judge. */
const sent = (
    over: { readonly [Key in keyof StoreEvent]?: unknown } = {}
): Record<string, unknown> =>
    Object.fromEntries(
        Object.entries<unknown>({
            id: 'e1',
            kind: 'search',
            at: 1_700_000_000_000,
            phrase: 'jacket',
            ...over,
        }).filter(([, value]) => value !== undefined)
    );

/** An event as the store's parser gives it back, which is all an event store takes. */
const event = (over: { readonly [Key in keyof StoreEvent]?: unknown } = {}): StoreEvent => {
    const [read] = parseEventBatch([sent(over)]) ?? [];
    if (!read) throw new Error(`expected the store to accept ${JSON.stringify(sent(over))}`);
    return read;
};

const post = (body: unknown, headers: Record<string, string> = {}) => ({
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    header: (name: string) => headers[name],
});

describe('an event batch', () => {
    it('accepts the three kinds with their closed set of fields', () => {
        expect(
            parseEventBatch([
                sent(),
                sent({ id: 'e2', kind: 'click', sku: 'SL-00001', position: 3 }),
                sent({
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
        expect(parseEventBatch([sent(), { ...sent({ id: 'e2' }), email: 'x@y.z' }])).toBe(
            undefined
        );
        expect(parseEventBatch([{ ...sent(), userAgent: 'browser' }])).toBe(undefined);
    });

    it('refuses what is not a list of events', () => {
        expect(parseEventBatch({ id: 'e1' })).toBe(undefined);
        expect(parseEventBatch([sent({ kind: 'purchase' })])).toBe(undefined);
        expect(parseEventBatch([sent({ at: Number.NaN })])).toBe(undefined);
        expect(parseEventBatch([sent({ id: '' })])).toBe(undefined);
        expect(parseEventBatch([sent({ position: 0 })])).toBe(undefined);
        expect(parseEventBatch([sent({ session: '' })])).toBe(undefined);
        expect(parseEventBatch(Array.from({ length: BATCH_LIMIT + 1 }, () => sent()))).toBe(
            undefined
        );
    });

    it('accepts an id, a sku and a session at their length limits', () => {
        const [read] =
            parseEventBatch([
                sent({ id: 'i'.repeat(64), sku: 's'.repeat(32), session: 't'.repeat(64) }),
            ]) ?? [];
        expect(read).toMatchObject({
            id: 'i'.repeat(64),
            sku: 's'.repeat(32),
            session: 't'.repeat(64),
        });
    });

    it.each([
        ['id', { id: 'i'.repeat(65) }],
        ['sku', { sku: 's'.repeat(33) }],
        ['session', { session: 't'.repeat(65) }],
    ])('refuses an event whose %s is one character past its limit', (_, over) => {
        expect(parseEventBatch([sent(over)])).toBe(undefined);
    });

    it.each([
        ['a phrase that is not text', { phrase: 7 }],
        ['a position that is not a whole number', { position: 1.5 }],
        ['a time that is not finite', { at: Number.POSITIVE_INFINITY }],
    ])('refuses a batch with %s', (_, over) => {
        expect(parseEventBatch([sent(over)])).toBe(undefined);
    });

    it('folds a phrase to a few lower case words and caps it', () => {
        const [folded] = parseEventBatch([sent({ phrase: '  Trail   RUNNER\n' })]) ?? [];
        expect(folded?.phrase).toBe('trail runner');
        const [long] = parseEventBatch([sent({ phrase: 'a'.repeat(200) })]) ?? [];
        expect(long?.phrase).toHaveLength(80);
        const [blank] = parseEventBatch([sent({ phrase: '   ' })]) ?? [];
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

    it('keeps ten thousand events by default, letting the oldest go', async () => {
        const store = createMemoryEventStore();
        await store.append(Array.from({ length: 10_001 }, (_, at) => event({ id: `e${at}`, at })));
        const all = await store.all();
        expect(all).toHaveLength(10_000);
        expect(all[0]?.id).toBe('e1');
    });
});

describe('the receiver', () => {
    const kept = async (store: EventStore) => (await store.all()).map((e) => e.id);

    it('keeps a posted batch and answers with nothing to say', async () => {
        const store = createMemoryEventStore();
        expect(await receiveEvents(post([sent()]), store, new Date())).toEqual({ status: 204 });
        expect(await kept(store)).toEqual(['e1']);
    });

    it('brings a time ahead of its own back to when the batch arrived', async () => {
        const store = createMemoryEventStore();
        await receiveEvents(
            post([sent({ at: 5_000 }), sent({ id: 'e2', at: 500 })]),
            store,
            new Date(1_000)
        );
        expect((await store.all()).map((e) => [e.id, e.at])).toEqual([
            ['e2', 500],
            ['e1', 1_000],
        ]);
    });

    it('keeps nothing when the browser sends Global Privacy Control', async () => {
        const store = createMemoryEventStore();
        expect(
            await receiveEvents(post([sent()], { [GPC_HEADER]: '1' }), store, new Date())
        ).toEqual({
            status: 204,
        });
        expect(await kept(store)).toEqual([]);
    });

    it('refuses what is not a batch, and anything but a post', async () => {
        const store = createMemoryEventStore();
        expect((await receiveEvents(post('{'), store, new Date())).status).toBe(400);
        expect((await receiveEvents(post([{ id: 'x' }]), store, new Date())).status).toBe(400);
        expect(
            (await receiveEvents({ ...post([sent()]), method: 'GET' }, store, new Date())).status
        ).toBe(405);
        expect(await kept(store)).toEqual([]);
    });
});
