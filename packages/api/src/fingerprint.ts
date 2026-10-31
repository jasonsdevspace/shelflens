/**
 * One text for one value, and a short name for it.
 *
 * `canonical` is JSON with object keys in one order and every hole written
 * as null, so two values that mean the same thing are the same text.
 * `fingerprint` folds that text into a few hex digits, for a version that
 * has to be derived from the thing it versions rather than remembered.
 * The hash is FNV-1a, which is not for security and does not need to be:
 * a collision costs one stale answer in a cache, not a secret.
 */

export const canonical = (value: unknown): string => {
    if (value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const fields = Object.entries(value as Record<string, unknown>)
            .filter(([, inner]) => inner !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([name, inner]) => `${JSON.stringify(name)}:${canonical(inner)}`);
        return `{${fields.join(',')}}`;
    }
    return JSON.stringify(value);
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
