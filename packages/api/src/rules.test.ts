import type { Rule } from '@jasonsdevspace/shelflens';
import { describe, expect, it } from 'vitest';

import { createMemoryRuleStore, isRulesPath, receiveRules, type RulesHost } from './rules.js';

/*
 * The rules path: a read says what is in effect and whether it was
 * saved, a post replaces the set once the engine would accept it, a
 * delete puts the shipped file back, and each says whether the host has
 * to build the store again.
 */

const shipped: Rule[] = [{ id: 'shipped', when: { queries: ['jacket'] }, pin: ['SL-00001'] }];
const draft: Rule[] = [{ id: 'draft', when: { queries: ['boot'] }, hide: ['SL-00002'] }];

const host = (refuse?: string): RulesHost => ({
    shipped,
    check: () => {
        if (refuse) throw new Error(refuse);
    },
});

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

describe('the rules path', () => {
    it('reads the shipped set until one is saved, then the saved one', async () => {
        const store = createMemoryRuleStore();
        expect(await receiveRules({ method: 'GET' }, store, host())).toEqual({
            status: 200,
            body: { rules: shipped, edited: false },
            changed: false,
        });
        expect(await receiveRules(post({ rules: draft }), store, host())).toEqual({
            status: 204,
            changed: true,
        });
        expect((await receiveRules({ method: 'GET' }, store, host())).body).toEqual({
            rules: draft,
            edited: true,
        });
    });

    it('puts the shipped set back on a delete, and says so only when something was saved', async () => {
        const store = createMemoryRuleStore();
        expect(await receiveRules({ method: 'DELETE' }, store, host())).toEqual({
            status: 204,
            changed: false,
        });
        await receiveRules(post({ rules: draft }), store, host());
        expect(await receiveRules({ method: 'DELETE' }, store, host())).toEqual({
            status: 204,
            changed: true,
        });
        expect((await receiveRules({ method: 'GET' }, store, host())).body?.edited).toBe(false);
    });

    it('refuses what the engine would refuse, in its words, and keeps the set it had', async () => {
        const store = createMemoryRuleStore();
        const refused = await receiveRules(
            post({ rules: draft }),
            store,
            host('rule draft does nothing')
        );
        expect(refused).toEqual({
            status: 400,
            message: 'rule draft does nothing',
            changed: false,
        });
        expect(await store.current()).toBeUndefined();
        expect((await receiveRules(post('nonsense'), store, host())).status).toBe(400);
        expect((await receiveRules(post({ rules: [{}] }), store, host())).status).toBe(400);
        expect((await receiveRules({ method: 'PUT' }, store, host())).status).toBe(405);
    });

    it('is rules under the base, and nothing else', () => {
        expect(isRulesPath('/rules')).toBe(true);
        expect(isRulesPath('https://example.test/shelflens/rules', '/shelflens/')).toBe(true);
        expect(isRulesPath('/rules', '/shelflens/')).toBe(false);
    });
});
