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
        expect(() => parseRulesFile('rules')).toThrow('not an object');
    });
});
