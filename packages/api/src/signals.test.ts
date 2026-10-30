import { describe, expect, it } from 'vitest';

import type { StoreEvent } from './events.js';
import { signalsOf } from './signals.js';

const event = (kind: StoreEvent['kind'], sku?: string, session?: string): StoreEvent => ({
    id: `${kind}-${sku ?? 'none'}-${Math.random()}`,
    kind,
    at: 1,
    ...(sku !== undefined && { sku }),
    ...(session !== undefined && { session }),
});

describe('signals from events', () => {
    it('counts the visits that clicked each product, and nothing else', () => {
        const signals = signalsOf([
            event('click', 'A', 't1'),
            event('click', 'A', 't1'),
            event('click', 'A', 't2'),
            event('click', 'B', 't1'),
            event('click', 'B'),
            event('click', 'B'),
            event('view', 'A', 't3'),
            event('search'),
            event('click'),
        ]);
        expect({ ...signals }).toEqual({ A: 2, B: 3 });
        expect({ ...signalsOf([]) }).toEqual({});
    });

    it('keeps a sku spelled like a method of Object as a sku', () => {
        const signals = signalsOf([event('click', 'constructor', 't1')]);
        expect(signals.constructor).toBe(1);
        expect(Object.getPrototypeOf(signals)).toBeNull();
    });
});
