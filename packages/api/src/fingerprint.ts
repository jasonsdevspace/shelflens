/**
 * One text for one value, and a short name for it.
 *
 * `canonical` is JSON with object keys in one order, a field whose value is
 * undefined left out, and undefined or an empty slot in an array written as
 * null, so two values that mean the same thing are the same text.
 * `fingerprint` folds that text into a few hex digits, for a version that
 * has to be derived from the thing it versions rather than remembered.
 * The hash is FNV-1a, which is not for security and does not need to be:
 * a collision costs one stale answer in a cache, not a secret.
 */

/**
 * Hands the serializer each object with its keys in order. The serializer
 * itself does the rest, natively, which is what makes this fast: it leaves
 * out undefined fields, writes undefined in an array as null, and writes a
 * date as its ISO text.
 */
const inKeyOrder = (_key: string, value: unknown): unknown => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((a, b) => (a < b ? -1 : 1))) {
        ordered[key] = record[key];
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
