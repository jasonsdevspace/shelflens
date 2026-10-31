/**
 * One text for one value, and a short name for it.
 *
 * `canonical` is JSON with object keys in one order, a field whose value is
 * undefined left out, and undefined or an empty slot in an array written as
 * null, so two values that mean the same thing are the same text, whatever
 * order their keys were written in. `fingerprint` folds that text into a
 * few hex digits, for a version that has to be derived from the thing it
 * versions rather than remembered. The hash is FNV-1a, which is not for
 * security and does not need to be: a collision costs one stale answer in a
 * cache, not a secret.
 *
 * The native serializer writes the text. The order is the one JavaScript
 * gives an object: keys that read as whole numbers first, in numeric order,
 * then the rest sorted. That holds whatever order the keys arrived in, which
 * is what makes it canonical. Like JSON, it writes a date, or anything with
 * its own toJSON, as what that returns, and leaves out a function.
 */

/**
 * Hands the serializer each object with its keys in order. A key named
 * "__proto__" is defined on the copy rather than assigned, since assigning
 * it would set the copy's prototype and lose the key. An object without a
 * prototype would keep it too, but the engine handles those as dictionaries,
 * which made the whole form about a third slower.
 */
const inKeyOrder = (_key: string, value: unknown): unknown => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
        if (key === '__proto__') {
            Object.defineProperty(ordered, key, {
                value: record[key],
                enumerable: true,
                writable: true,
                configurable: true,
            });
        } else {
            ordered[key] = record[key];
        }
    }
    return ordered;
};

export const canonical = (value: unknown): string => {
    // The serializer gives nothing back for a bare function, whatever its type says.
    const text = JSON.stringify(value === undefined ? null : value, inKeyOrder) as
        string | undefined;
    return text ?? 'null';
};

/** A text folded into eight hex digits, for a version that only has to change when the text does. */
export const hashText = (text: string): string => {
    let hash = 0x81_1c_9d_c5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
};

export const fingerprint = (value: unknown): string => hashText(canonical(value));
