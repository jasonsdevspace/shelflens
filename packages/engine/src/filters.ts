import type { Index } from './index-builder.js';
import { EngineError, type AttributeValue, type EngineConfig, type Filter } from './types.js';

/**
 * Filters narrow the candidate set before anything is scored.
 *
 * Each one is checked against the config first, so a filter on an attribute
 * nobody declared is reported as the caller's mistake rather than quietly
 * matching nothing.
 */

export const checkFilter = (config: EngineConfig, filter: Filter): void => {
    const kind = config.attributes[filter.attribute];
    if (!kind) {
        throw new EngineError('unknown_attribute', `no attribute named ${filter.attribute}`);
    }
    if ('range' in filter && kind !== 'number') {
        throw new EngineError(
            'wrong_attribute_kind',
            `attribute ${filter.attribute} is ${kind}, and only a number attribute takes a range`
        );
    }
    if ('eq' in filter && typeof filter.eq === 'boolean' && kind !== 'boolean') {
        throw new EngineError(
            'wrong_attribute_kind',
            `attribute ${filter.attribute} is ${kind}, and only a boolean attribute takes true or false`
        );
    }
};

export const matchesFilter = (value: AttributeValue | undefined, filter: Filter): boolean => {
    if (value === undefined) return false;
    if ('range' in filter) {
        if (typeof value !== 'number') return false;
        const { from, to } = filter.range;
        return (from === undefined || value >= from) && (to === undefined || value < to);
    }
    const values: readonly (string | number | boolean)[] = Array.isArray(value)
        ? (value as readonly string[])
        : [value as string | number | boolean];
    if ('eq' in filter) return values.includes(filter.eq);
    return values.some((v) => typeof v === 'string' && filter.in.includes(v));
};

/** Document numbers passing every filter. */
export const applyFilters = (index: Index, filters: readonly Filter[]): Set<number> | undefined => {
    if (filters.length === 0) return undefined;
    const passing = new Set<number>();
    index.attributes.forEach((attributes, doc) => {
        if (filters.every((filter) => matchesFilter(attributes.get(filter.attribute), filter))) {
            passing.add(doc);
        }
    });
    return passing;
};
