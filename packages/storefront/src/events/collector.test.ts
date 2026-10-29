import { parseEventBatch } from '@shelflens/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCollector, PAUSE_MS, trackingAllowed } from './collector.js';

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
        target: new EventTarget(),
        ...over,
    });
    return { ...made, send };
};

const sentBodies = (send: ReturnType<typeof vi.fn>) =>
    send.mock.calls.map(([, body]) => JSON.parse(body as string) as unknown);

describe('the collector', () => {
    it('sends what was recorded after a pause, as one batch the store accepts', async () => {
        const { record, send } = collector();
        record({ kind: 'search', phrase: 'jacket' });
        record({ kind: 'click', phrase: 'jacket', sku: 'SL-00001', position: 2 });
        record({ kind: 'view', sku: 'SL-00001', phrase: undefined });
        await vi.advanceTimersByTimeAsync(PAUSE_MS - 1);
        expect(send).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(send).toHaveBeenCalledTimes(1);
        const [body] = sentBodies(send);
        expect(body).toEqual([
            { id: 'e1', kind: 'search', at: 1_700_000_000_000, phrase: 'jacket' },
            {
                id: 'e2',
                kind: 'click',
                at: 1_700_000_000_000,
                phrase: 'jacket',
                sku: 'SL-00001',
                position: 2,
            },
            { id: 'e3', kind: 'view', at: 1_700_000_000_000, sku: 'SL-00001' },
        ]);
        expect(parseEventBatch(body)).toHaveLength(3);
        expect(send.mock.calls[0]?.[0]).toBe('/events');
    });

    it('serializes nothing beyond the closed set of fields', async () => {
        const { record, send } = collector();
        record({ kind: 'search', phrase: 'jacket' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        const [body] = sentBodies(send) as [Record<string, unknown>[]];
        expect(Object.keys(body[0] ?? {}).sort()).toEqual(['at', 'id', 'kind', 'phrase']);
    });

    it('sends nothing until the host is ready, then everything queued', async () => {
        let armed = () => undefined as void;
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

    it('keeps a batch the browser refused and sends it with the next', async () => {
        const { record, send } = collector();
        send.mockReturnValueOnce(false);
        record({ kind: 'search', phrase: 'jacket' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).toHaveBeenCalledTimes(1);
        record({ kind: 'search', phrase: 'boot' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).toHaveBeenCalledTimes(2);
        expect((sentBodies(send)[1] as unknown[]).length).toBe(2);
    });

    it('sends when the page is hidden or left, without waiting for the pause', async () => {
        const target = new EventTarget();
        const { record, send } = collector({ target });
        await vi.advanceTimersByTimeAsync(0);
        record({ kind: 'view', sku: 'SL-00001' });
        vi.stubGlobal('document', { visibilityState: 'hidden' });
        target.dispatchEvent(new Event('visibilitychange'));
        expect(send).toHaveBeenCalledTimes(1);
        record({ kind: 'view', sku: 'SL-00002' });
        target.dispatchEvent(new Event('pagehide'));
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('queues nothing, and so sends nothing, when the visitor is not to be tracked', async () => {
        const { record, flush, send } = collector({ allowed: false });
        record({ kind: 'search', phrase: 'jacket' });
        flush();
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(send).not.toHaveBeenCalled();
    });

    it('reads Global Privacy Control from the browser', () => {
        vi.stubGlobal('navigator', { globalPrivacyControl: true });
        expect(trackingAllowed()).toBe(false);
        vi.stubGlobal('navigator', {});
        expect(trackingAllowed()).toBe(true);
    });

    it('breaks nothing when the browser has no beacon', async () => {
        vi.stubGlobal('navigator', {});
        const made = createCollector({ url: '/events', target: new EventTarget() });
        expect(() => made.record({ kind: 'search', phrase: 'jacket' })).not.toThrow();
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        expect(() => made.dispose()).not.toThrow();
    });

    it('holds only so many events while they cannot be sent', async () => {
        const { record, send } = collector({ queueLimit: 3 });
        send.mockReturnValue(false);
        for (let i = 0; i < 5; i += 1) record({ kind: 'view', sku: `SL-0000${i}` });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        send.mockReturnValue(true);
        record({ kind: 'view', sku: 'SL-00009' });
        await vi.advanceTimersByTimeAsync(PAUSE_MS);
        const last = sentBodies(send).at(-1) as { sku: string }[];
        expect(last.map((e) => e.sku)).toEqual(['SL-00003', 'SL-00004', 'SL-00009']);
    });
});
