import { isList } from './index-builder.js';
import { type AttributeValue, type EngineConfig, EngineError, type Filter } from './types.js';

/**
 * Filters narrow the candidate set before anything is scored.
 *
 * Each one is checked against the config first, so a filter on an attribute
 * nobody declared, or one its attribute's kind cannot take, is reported as the
 * caller's mistake rather than quietly matching nothing.
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
    const words = 'in' in filter || ('eq' in filter && typeof filter.eq === 'string');
    if (words && kind !== 'keyword') {
        throw new EngineError(
            'wrong_attribute_kind',
            `attribute ${filter.attribute} is ${kind}, and only a keyword attribute takes a word`
        );
    }
};

/** Whether a value is the one wanted, or a list of values holds it. */
export const holds = (value: AttributeValue | undefined, wanted: string | boolean): boolean =>
    isList(value) ? typeof wanted === 'string' && value.includes(wanted) : value === wanted;

/** Whether a number is in a range, `from` inclusive and `to` exclusive. */
export const inRange = (
    value: number,
    { from, to }: { readonly from?: number; readonly to?: number }
): boolean => (from === undefined || value >= from) && (to === undefined || value < to);

export const matchesFilter = (value: AttributeValue | undefined, filter: Filter): boolean => {
    if ('range' in filter) return typeof value === 'number' && inRange(value, filter.range);
    if ('eq' in filter) return holds(value, filter.eq);
    return filter.in.some((wanted) => holds(value, wanted));
};
