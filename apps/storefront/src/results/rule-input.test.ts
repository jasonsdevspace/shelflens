// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Rule } from '@jasonsdevspace/shelflens';
import { buildSchema, type GraphQLInputType, validateInputValue } from 'graphql';
import { describe, expect, it } from 'vitest';

import { ACTIONS, fresh, ruleOf } from './rule-form.js';
import { toRuleInput } from './rule-input.js';

/*
 * What the page sends to a preview is checked against the schema's own
 * RuleInput, the way the API checks it, for every rule the page can hold.
 */

const schema = buildSchema(
    readFileSync(
        join(__dirname, '..', '..', '..', '..', 'packages', 'api', 'schema.graphql'),
        'utf8'
    )
);
const RULE_INPUT = schema.getType('RuleInput') as GraphQLInputType;

/** What the API would say is wrong with a value given as a RuleInput, nothing when it is one. */
const problemsOf = (value: unknown): string[] => {
    const problems: string[] = [];
    validateInputValue(value, RULE_INPUT, (error) => problems.push(error.message));
    return problems;
};

const shipped = (
    JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'rules.json'), 'utf8')) as {
        rules: Rule[];
    }
).rules;

describe('a rule sent to a preview', () => {
    it('is a RuleInput, for every rule the store ships', () => {
        expect(shipped.length).toBeGreaterThan(0);
        for (const rule of shipped) {
            expect(problemsOf(toRuleInput(rule)), rule.id).toEqual([]);
        }
    });

    it('is a RuleInput, for every action the form can build', () => {
        for (const { value } of ACTIONS) {
            const rule = ruleOf({
                ...fresh('jacket'),
                name: 'A rule',
                action: value,
                skus: ['SL-00001'],
            });
            expect(problemsOf(toRuleInput(rule)), value).toEqual([]);
        }
    });

    it('leaves behind a field the schema does not name, which the API would refuse', () => {
        const carried = { id: 'r', pin: ['SL-00001'], note: 'kept by the engine only' } as Rule;
        expect(problemsOf(carried)).not.toEqual([]);
        expect(toRuleInput(carried)).toEqual({ id: 'r', pin: ['SL-00001'] });
    });
});
