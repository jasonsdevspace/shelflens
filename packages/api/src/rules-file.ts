import type { Rule, RuleAdjustment, RuleTrigger } from '@jasonsdevspace/shelflens';

import { isRecord } from './guards.js';

/**
 * The merchandising rules file, read once and the same way by every host.
 *
 * The file is an object with the rules under one key, so it can grow a
 * version or a note without the rules moving. A file that is not that
 * shape is refused here, before the engine checks what each rule says, so
 * a misspelled key cannot ship a store with no merchandising and no error.
 *
 * Each rule is read field by field into a rule of the engine's own type.
 * The engine checks what a rule names, the documents and the attributes,
 * and trusts the shape it is given, so a list given as a word would be read
 * one letter at a time, or fail every search the rule applies to.
 */

/** A field of the wrong shape, reported with the rule it is in. */
class Misshapen extends Error {}

/** A field left out, which JSON may also write as null. */
const absent = (value: unknown): value is undefined | null => value === undefined || value === null;

const text = (value: unknown, field: string): string => {
    if (typeof value !== 'string') throw new Misshapen(`its ${field} is not text`);
    return value;
};

const texts = (value: unknown, field: string): readonly string[] => {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        throw new Misshapen(`its ${field} is not a list of text`);
    }
    return value;
};

const record = (value: unknown, field: string): Record<string, unknown> => {
    if (!isRecord(value)) throw new Misshapen(`its ${field} is not an object`);
    return value;
};

const trigger = (value: unknown): RuleTrigger => {
    const { queries, filter } = record(value, 'when');
    const inside = absent(filter) ? undefined : record(filter, 'when filter');
    return {
        ...(!absent(queries) && { queries: texts(queries, 'when queries') }),
        ...(inside && {
            filter: {
                attribute: text(inside['attribute'], 'when filter attribute'),
                value: text(inside['value'], 'when filter value'),
            },
        }),
    };
};

const adjustment = (value: unknown, where: string): RuleAdjustment => {
    const { ids, attribute, weight } = record(value, where);
    if (typeof weight !== 'number') throw new Misshapen(`its ${where} has no number weight`);
    const named = absent(attribute) ? undefined : record(attribute, `${where} attribute`);
    return {
        ...(!absent(ids) && { ids: texts(ids, `${where} ids`) }),
        ...(named && {
            attribute: {
                name: text(named['name'], `${where} attribute name`),
                value: text(named['value'], `${where} attribute value`),
            },
        }),
        weight,
    };
};

const adjustments = (value: unknown, field: string): readonly RuleAdjustment[] => {
    if (!Array.isArray(value)) throw new Misshapen(`its ${field} is not a list`);
    return value.map((entry: unknown, index) => adjustment(entry, `${field} ${index + 1}`));
};

const activeWindow = (value: unknown): NonNullable<Rule['active']> => {
    const { from, to } = record(value, 'active window');
    return {
        ...(!absent(from) && { from: text(from, 'active from') }),
        ...(!absent(to) && { to: text(to, 'active to') }),
    };
};

/** One rule, read field by field, so every list is a list and every name is text. */
const ruleOf = (value: Record<string, unknown>, id: string): Rule => {
    const { name, when, active, pin, boost, bury, hide } = value;
    return {
        id,
        ...(!absent(name) && { name: text(name, 'name') }),
        ...(!absent(when) && { when: trigger(when) }),
        ...(!absent(active) && { active: activeWindow(active) }),
        ...(!absent(pin) && { pin: texts(pin, 'pin') }),
        ...(!absent(boost) && { boost: adjustments(boost, 'boost') }),
        ...(!absent(bury) && { bury: adjustments(bury, 'bury') }),
        ...(!absent(hide) && { hide: texts(hide, 'hide') }),
    };
};

export const parseRulesFile = (json: unknown): readonly Rule[] => {
    if (!isRecord(json)) throw new Error('the rules file is not an object');
    const { rules } = json;
    if (!Array.isArray(rules)) throw new Error('the rules file has no "rules" array');
    return rules.map((rule: unknown, index) => {
        const id = isRecord(rule) ? rule['id'] : undefined;
        if (!isRecord(rule) || typeof id !== 'string') {
            throw new Error(`rule ${index + 1} in the rules file has no id`);
        }
        try {
            return ruleOf(rule, id);
        } catch (error) {
            if (!(error instanceof Misshapen)) throw error;
            throw new Error(`rule ${id} in the rules file: ${error.message}`, { cause: error });
        }
    });
};
