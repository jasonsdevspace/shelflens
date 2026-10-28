import type { Rule } from '@jasonsdevspace/shelflens';

/**
 * The merchandising rules file, read once and the same way by every host.
 *
 * The file is an object with the rules under one key, so it can grow a
 * version or a note without the rules moving. A file that is not that
 * shape is refused here, before the engine checks what each rule says, so
 * a misspelled key cannot ship a store with no merchandising and no error.
 */
export const parseRulesFile = (json: unknown): readonly Rule[] => {
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        throw new Error('the rules file is not an object');
    }
    const { rules } = json as { rules?: unknown };
    if (!Array.isArray(rules)) throw new Error('the rules file has no "rules" array');
    rules.forEach((rule: unknown, index) => {
        if (typeof rule !== 'object' || rule === null || typeof (rule as Rule).id !== 'string') {
            throw new Error(`rule ${index + 1} in the rules file has no id`);
        }
    });
    return rules as Rule[];
};
