import { describe, expect, it } from 'vitest';

import { createLatest } from './latest.js';

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
};

describe('only the newest request counts', () => {
    it('reports an earlier run as stale when it finishes after a later one', async () => {
        const latest = createLatest();
        const first = deferred<string>();
        const second = deferred<string>();
        const firstOutcome = latest.run(() => first.promise);
        const secondOutcome = latest.run(() => second.promise);

        second.resolve('second');
        first.resolve('first');

        expect(await secondOutcome).toEqual({ stale: false, value: 'second' });
        expect(await firstOutcome).toEqual({ stale: true });
    });

    it('aborts the earlier run as soon as a later one starts', () => {
        const latest = createLatest();
        let firstSignal: AbortSignal | undefined;
        void latest.run((signal) => {
            firstSignal = signal;
            return new Promise<never>(() => {});
        });
        expect(firstSignal?.aborted).toBe(false);
        void latest.run(() => Promise.resolve('second'));
        expect(firstSignal?.aborted).toBe(true);
    });

    it('swallows the failure of a run that is already stale, and surfaces a current one', async () => {
        const latest = createLatest();
        const first = deferred<string>();
        const firstOutcome = latest.run(() => first.promise);
        const second = deferred<string>();
        const secondOutcome = latest.run(() => second.promise);

        first.reject(new Error('network'));
        expect(await firstOutcome).toEqual({ stale: true });

        second.reject(new Error('server'));
        await expect(secondOutcome).rejects.toThrow('server');
    });

    it('makes whatever is in flight stale when canceled', async () => {
        const latest = createLatest();
        const only = deferred<string>();
        const outcome = latest.run(() => only.promise);
        latest.cancel();
        only.resolve('late');
        expect(await outcome).toEqual({ stale: true });
    });
});
