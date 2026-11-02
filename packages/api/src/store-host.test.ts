import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryEventStore } from './events.js';
import { createMemoryRuleStore } from './rules.js';
import { createStoreHost } from './store-host.js';

const catalog = generateCatalog({ seed: 42, products: 200 });
const jacket = catalog.products.find((p) => /jacket/i.test(p.name));
if (!jacket) throw new Error('expected a jacket');
const shipped = [{ id: 'shipped', when: { queries: ['jacket'] }, pin: [jacket.sku] }];

const hostWith = () => {
    const source = vi.fn(() => Promise.resolve({ catalog, rules: shipped }));
    const events = createMemoryEventStore();
    const rules = createMemoryRuleStore();
    const host = createStoreHost({ source, events, rules });
    return { host, source, events, rules };
};

const click = (id: string, sku: string, session: string) => ({
    id,
    kind: 'click' as const,
    at: Number(id.replace(/\D/g, '')),
    sku,
    session,
    phrase: 'jacket',
    position: 3,
});

describe('a store host', () => {
    it('builds once, from its source, the first time anything asks', async () => {
        const { host, source } = hostWith();
        const [a, b] = await Promise.all([host.current(), host.current()]);
        expect(a).toBe(b);
        expect(source).toHaveBeenCalledOnce();
        expect(host.startup().buildMs).toBeGreaterThan(0);
    });

    it('builds again on a saved set, over the index it has, as a new version', async () => {
        const { host } = hostWith();
        const first = await host.current();
        const saved = [
            { id: 'mine', when: { queries: ['jacket'] }, pin: [catalog.products[0]?.sku ?? ''] },
        ];
        const answer = await host.receiveRules({
            method: 'POST',
            body: JSON.stringify({ rules: saved }),
        });
        expect(answer.status).toBe(204);
        const next = await host.current();
        expect(answer.version).toBe(next.api.version);
        expect(next.api.version).not.toBe(first.api.version);
        expect(next.model.rulesEdited).toBe(true);
        // The catalog's index and lookups are the ones the first build made.
        expect(next.model.completions).toBe(first.model.completions);
        expect(next.model.products).toBe(first.model.products);
    });

    it('refuses a set the engine refuses, and keeps the store it has', async () => {
        const { host } = hostWith();
        const first = await host.current();
        const answer = await host.receiveRules({
            method: 'POST',
            body: JSON.stringify({ rules: [{ id: 'ghost', pin: ['SL-99999'] }] }),
        });
        expect(answer.status).toBe(400);
        expect(await host.current()).toBe(first);
    });

    it('folds new clicks in when a visit begins, and does nothing when there are none', async () => {
        const { host, events } = hostWith();
        const first = await host.current();
        expect(await host.refresh()).toBe(false);
        await events.append([click('c1', jacket.sku, 'a'), click('c2', jacket.sku, 'b')]);
        expect(await host.refresh()).toBe(true);
        const next = await host.current();
        expect(next.api.version).toMatch(/\+clicks\./);
        expect(next.model.completions).toBe(first.model.completions);
        expect(await host.refresh()).toBe(false);
    });

    it('makes one change at a time, so a visit and a save land in the order asked', async () => {
        const { host, events } = hostWith();
        await host.current();
        await events.append([click('c1', jacket.sku, 'a')]);
        const saved = [{ id: 'mine', when: { queries: ['jacket'] }, pin: [jacket.sku] }];
        const [, answer] = await Promise.all([
            host.refresh(),
            host.receiveRules({ method: 'POST', body: JSON.stringify({ rules: saved }) }),
        ]);
        const last = await host.current();
        // The store served last has both, whichever finished first.
        expect(last.api.version).toBe(answer.version);
        expect(last.model.rulesEdited).toBe(true);
        expect(last.api.version).toMatch(/\+clicks\./);
    });

    it('reads its source again once told to forget it', async () => {
        const { host, source } = hostWith();
        await host.current();
        host.forget();
        expect(await host.served()).toBeUndefined();
        await host.current();
        expect(source).toHaveBeenCalledTimes(2);
    });

    it('says it keeps no rules when it was given nowhere to keep them', async () => {
        const host = createStoreHost({ source: () => Promise.resolve({ catalog, rules: [] }) });
        expect((await host.receiveRules({ method: 'GET' })).status).toBe(404);
    });
});
