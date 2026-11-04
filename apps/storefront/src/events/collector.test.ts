import { parseEventBatch } from '@shelflens/api';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { nth } from '../test/dom.js';
import { createCollector, PAUSE_MS } from './collector.js';

/*
 * The telemetry rules, in the page: a batch holds only what the store
 * accepts, nothing goes before the host is ready, a refused batch waits,
 * a missing beacon breaks nothing, and under Global Privacy Control
 * nothing is queued.
 */

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const collector = (over: Partial<Parameters<typeof createCollector>[0]> = {}) => {
    const send = vi.fn<(url: string, body: string) => boolean>().mockReturnValue(true);
    let n = 0;
    const made = createCollector({
        url: '/events',
        send,
        now: () => 1_700_000_000_000,
        id: () => `e${(n += 1)}`,
        session: () => 'tab',
        ...over,
    });
    return { ...made, send };
};

type Send = Mock<(url: string, body: string) => boolean>;

/** What each send carried, parsed but not checked, for a test that reads a body exactly. */
const sentBodies = (send: Send): unknown[] =>
    send.mock.calls.map(([, body]): unknown => JSON.parse(body));

/** Each batch sent, read through the store's own parser, so one it would refuse fails here. */
const batches = (send: Send) =>
    sentBodies(send).map((body) => {
        const batch = parseEventBatch(body);
        if (!batch)
            throw new Error(`expected a batch the store accepts, not ${JSON.stringify(body)}`);
        return batch;
    });

describe('the collector', () => {
    it('sends what was recorded after a pause, as one batch the store accepts', async () => {
        const { record, send } = collector();
        record({ kind: 'search', phrase: 'jacket' });
        record({ kind: 'click', phrase: 'jacket', sku: 'SL-00001', position: 2 });
        await vi.advanceTimersByTimeAsync(PAUSE_MS - 1);
        expect(send).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(send).toHaveBeenCalledTimes(1);
        const [body] = sentBodies(send);
        expect(body).toEqual([
            { id: 'e1', kind: 'search', at: 1_700_000_000_000, phrase: 'jacket', session: 'tab' },
            {
                id: 'e2',
                kind: 'click',
                at: 1_700_000_000_000,
                phrase: 'jacket',
                sku: 'SL-00001',
                position: 2,
                session: 'tab',
            },
        ]);
        expect(parseEventBatch(body)).toHaveLength(2);
        expect(send.mock.calls[0]?.[0]).toBe('/events');
    });

    it('serializes nothing beyond the closed set of fields', async () => {
        const { record, send } = collector({ session: () => undefined });
        record({ kind: 'search', phrase: 'jacket' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(sentBodies(send)).toEqual([
            [{ id: 'e1', kind: 'search', at: 1_700_000_000_000, phrase: 'jacket' }],
        ]);
    });

    it('sends a view at once, with whatever was queued before it', async () => {
        const { record, send } = collector();
        await vi.advanceTimersByTimeAsync(0);
        record({ kind: 'search', phrase: 'jacket' });
        record({ kind: 'view', sku: 'SL-00001' });
        expect(send).toHaveBeenCalledTimes(1);
        expect(nth(batches(send), 0, 'a batch').map((e) => e.kind)).toEqual(['search', 'view']);
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('sends nothing until the host is ready, then everything queued', async () => {
        let armed: () => void = () => undefined;
        const ready = new Promise<void>((resolve) => {
            armed = resolve;
        });
        const { record, send } = collector({ ready });
        record({ kind: 'search', phrase: 'jacket' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS * 2);
        expect(send).not.toHaveBeenCalled();
        armed();
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).toHaveBeenCalledTimes(1);
        expect(sentBodies(send)[0]).toHaveLength(1);
    });

    it('tries a declined view again after the pause', async () => {
        const { record, send } = collector();
        await vi.advanceTimersByTimeAsync(0);
        send.mockReturnValueOnce(false);
        record({ kind: 'view', sku: 'SL-00001' });
        expect(send).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).toHaveBeenCalledTimes(2);
        expect(nth(batches(send), 1, 'a second batch')).toHaveLength(1);
    });

    it('keeps a batch the browser refused and sends it with the next', async () => {
        const { record, send } = collector();
        send.mockReturnValueOnce(false);
        record({ kind: 'search', phrase: 'jacket' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).toHaveBeenCalledTimes(1);
        record({ kind: 'search', phrase: 'boot' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).toHaveBeenCalledTimes(2);
        expect(nth(batches(send), 1, 'a second batch')).toHaveLength(2);
    });

    it('sends when the page is hidden or left, without waiting for the pause', async () => {
        const target = new EventTarget();
        const { record, send, attach } = collector();
        const detach = attach(target);
        await vi.advanceTimersByTimeAsync(0);
        record({ kind: 'search', phrase: 'one' });
        vi.stubGlobal('document', { visibilityState: 'hidden' });
        target.dispatchEvent(new Event('visibilitychange'));
        expect(send).toHaveBeenCalledTimes(1);
        record({ kind: 'search', phrase: 'two' });
        target.dispatchEvent(new Event('pagehide'));
        expect(send).toHaveBeenCalledTimes(2);
        record({ kind: 'search', phrase: 'three' });
        detach();
        expect(send).toHaveBeenCalledTimes(3);
        record({ kind: 'search', phrase: 'four' });
        target.dispatchEvent(new Event('pagehide'));
        expect(send).toHaveBeenCalledTimes(3);
    });

    it('drains a long queue batch by batch in one flush', async () => {
        const { record, send } = collector();
        for (let i = 0; i < 250; i += 1) record({ kind: 'click', sku: `SL-${i}` });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).toHaveBeenCalledTimes(2);
        expect(nth(batches(send), 0, 'a first batch')).toHaveLength(100);
        expect(nth(batches(send), 1, 'a second batch')).toHaveLength(100);
    });

    it('queues nothing, and so sends nothing, when the visitor is not to be tracked', async () => {
        const { record, flush, send } = collector({ allowed: false });
        record({ kind: 'search', phrase: 'jacket' });
        flush();
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).not.toHaveBeenCalled();
    });

    it('breaks nothing when the browser has no beacon', async () => {
        vi.stubGlobal('navigator', {});
        const made = createCollector({ url: '/events' });
        const detach = made.attach(new EventTarget());
        expect(() => made.record({ kind: 'search', phrase: 'jacket' })).not.toThrow();
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(() => detach()).not.toThrow();
    });

    it('holds only so many events while they cannot be sent', async () => {
        const { record, send } = collector({ queueLimit: 3 });
        send.mockReturnValue(false);
        for (let i = 0; i < 5; i += 1) record({ kind: 'click', sku: `SL-0000${i}` });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        send.mockReturnValue(true);
        record({ kind: 'click', sku: 'SL-00009' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        const last = nth(batches(send), -1, 'a last batch');
        expect(last.map((e) => e.sku)).toEqual(['SL-00003', 'SL-00004', 'SL-00009']);
    });
});
