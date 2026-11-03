import type { Rule, RuleAdjustment, RuleTrigger } from '@jasonsdevspace/shelflens';

import type {
    RuleAdjustmentInput,
    RuleInput,
    RuleTriggerInput,
    RuleWindowInput,
} from '../generated/operations.js';

/*
 * A rule the page holds, as the API's preview takes it.
 *
 * The page's rules are the engine's own, from the store's set and from the
 * form, and the preview takes the schema's RuleInput. Each field is copied
 * by name, so the types check every one against the schema, and a field the
 * engine's rule carries that the schema does not name is left behind rather
 * than sent and refused.
 */

const adjustmentOf = ({ ids, attribute, weight }: RuleAdjustment): RuleAdjustmentInput => ({
    ...(ids && { ids }),
    ...(attribute && { attribute: { name: attribute.name, value: attribute.value } }),
    weight,
});

const triggerOf = ({ queries, filter }: RuleTrigger): RuleTriggerInput => ({
    ...(queries && { queries }),
    ...(filter && { filter: { attribute: filter.attribute, value: filter.value } }),
});

const windowOf = ({ from, to }: NonNullable<Rule['active']>): RuleWindowInput => ({
    ...(from !== undefined && { from }),
    ...(to !== undefined && { to }),
});

export const toRuleInput = (rule: Rule): RuleInput => ({
    id: rule.id,
    ...(rule.name !== undefined && { name: rule.name }),
    ...(rule.when && { when: triggerOf(rule.when) }),
    ...(rule.active && { active: windowOf(rule.active) }),
    ...(rule.pin && { pin: rule.pin }),
    ...(rule.boost && { boost: rule.boost.map(adjustmentOf) }),
    ...(rule.bury && { bury: rule.bury.map(adjustmentOf) }),
    ...(rule.hide && { hide: rule.hide }),
});
