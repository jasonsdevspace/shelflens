import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseRulesFile } from './rules-file.js';

describe('the rules file', () => {
    it('is an object with the rules under one key, each with an id', () => {
        const rules = [{ id: 'a', pin: ['x'] }];
        expect(parseRulesFile({ rules })).toEqual(rules);
        expect(parseRulesFile({ rules: [], note: 'none yet' })).toEqual([]);
    });

    it('is refused in any other shape, so a misspelled key cannot ship no rules', () => {
        expect(() => parseRulesFile([{ id: 'a' }])).toThrow('not an object');
        expect(() => parseRulesFile({ rule: [] })).toThrow('no "rules" array');
        expect(() => parseRulesFile({ rules: [{ pin: ['x'] }] })).toThrow(
            'rule 1 in the rules file has no id'
        );
        expect(() => parseRulesFile({ rules: [{ id: 7, pin: ['x'] }] })).toThrow(
            'rule 1 in the rules file has no id'
        );
        expect(() => parseRulesFile('rules')).toThrow('not an object');
    });

    it('refuses a rule of the wrong shape, naming the rule and the field', () => {
        const refused: [unknown, string][] = [
            [
                { id: 'a', when: { queries: 'jacket' } },
                'rule a in the rules file: its when queries is not a list of text',
            ],
            [
                { id: 'a', pin: 'SL-00001' },
                'rule a in the rules file: its pin is not a list of text',
            ],
            [{ id: 'a', hide: [7] }, 'its hide is not a list of text'],
            [{ id: 'a', name: 7 }, 'its name is not text'],
            [
                { id: 'a', when: { filter: { attribute: 'brand' } } },
                'its when filter value is not text',
            ],
            [{ id: 'a', active: { from: 2026 } }, 'its active from is not text'],
            [{ id: 'a', boost: { ids: ['x'], weight: 2 } }, 'its boost is not a list'],
            [{ id: 'a', boost: [{ ids: ['x'] }] }, 'its boost 1 has no number weight'],
            [
                { id: 'a', bury: [{ attribute: { name: 'brand', value: 3 }, weight: 0.5 }] },
                'its bury 1 attribute value is not text',
            ],
            [
                { id: 'a', boost: [{ ids: 'x', weight: 2 }] },
                'its boost 1 ids is not a list of text',
            ],
            [
                { id: 'a', when: { filter: { attribute: 3, value: 'x' } } },
                'its when filter attribute is not text',
            ],
            [{ id: 'a', active: { to: 2027 } }, 'its active to is not text'],
        ];
        refused.push(
            [
                { id: 'a', when: { query: ['jacket'] } },
                'its when has query, which a rule does not take',
            ],
            [{ id: 'a', pins: ['x'] }, 'its rule has pins, which a rule does not take'],
            [{ id: 'a', boost: [{ ids: ['x'], weight: 2, wieght: 3 }] }, 'its boost 1 has wieght'],
            [
                { id: 'a', when: { filter: { attribute: 'brand', value: 'x', op: 'eq' } } },
                'its when filter has op',
            ],
            [
                {
                    id: 'a',
                    bury: [{ attribute: { name: 'brand', value: 'x', kind: 1 }, weight: 1 }],
                },
                'its bury 1 attribute has kind',
            ],
            [
                { id: 'a', active: { from: '2026-01-01', until: '2027-01-01' } },
                'its active window has until',
            ],
            [
                { id: 'a', when: { queries: null, filter: null }, hide: ['x'] },
                'its when names no queries and no filter',
            ]
        );
        for (const [rule, reason] of refused) {
            expect(() => parseRulesFile({ rules: [rule] }), reason).toThrow(reason);
        }
    });

    it('reads every field a rule has, and takes null as left out', () => {
        const rule = {
            id: 'every',
            name: 'Every field',
            when: { queries: ['jacket'], filter: { attribute: 'brand', value: 'Ostara' } },
            active: { from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' },
            pin: ['a'],
            boost: [{ ids: ['b'], weight: 2 }],
            bury: [{ attribute: { name: 'brand', value: 'Finch' }, weight: 0.5 }],
            hide: ['c'],
        };
        expect(parseRulesFile({ rules: [rule] })).toEqual([rule]);
        expect(parseRulesFile({ rules: [{ id: 'a', name: null, pin: null }] })).toEqual([
            { id: 'a' },
        ]);
    });

    it('reads the rules the demo ships', () => {
        const shipped: unknown = JSON.parse(
            readFileSync(
                new URL('../../../apps/storefront/public/rules.json', import.meta.url),
                'utf8'
            )
        );
        expect(parseRulesFile(shipped).length).toBeGreaterThan(0);
    });
});
