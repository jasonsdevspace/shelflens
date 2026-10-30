import { describe, expect, it } from 'vitest';

import type { StoreEvent } from './events.js';
import { signalsOf } from './signals.js';

const event = (kind: StoreEvent['kind'], sku?: string): StoreEvent => ({
    id: `${kind}-${sku ?? 'none'}-${Math.random()}`,
    kind,
    at: 1,
    ...(sku !== undefined && { sku }),
});

describe('signals from events', () => {
    it('counts clicks by product, and nothing else', () => {
        const signals = signalsOf([
            event('click', 'A'),
            event('click', 'A'),
            event('click', 'B'),
            event('view', 'A'),
            event('search'),
            event('click'),
        ]);
        expect(signals).toEqual({ A: 2, B: 1 });
        expect(signalsOf([])).toEqual({});
    });
});
