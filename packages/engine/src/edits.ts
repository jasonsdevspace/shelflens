/**
 * Whether two terms are one typo apart.
 *
 * One typo means one inserted, deleted or substituted character, or two
 * adjacent characters swapped. Swaps count as one edit because they are the
 * most common typing mistake, and a tolerance that charged two for them
 * would miss "shoe" typed as "shoe" with the middle letters crossed.
 *
 * Written as a direct comparison rather than a general edit distance,
 * because the question is only ever "within one", and answering that is
 * far cheaper than computing how far apart two terms are.
 */
export const withinOneEdit = (a: string, b: string): boolean => {
    if (a === b) return true;
    const lengthGap = a.length - b.length;
    if (lengthGap > 1 || lengthGap < -1) return false;

    if (lengthGap === 0) {
        let first = -1;
        for (let i = 0; i < a.length; i += 1) {
            if (a[i] === b[i]) continue;
            if (first === -1) {
                first = i;
                continue;
            }
            // A second mismatch is allowed only as the other half of a swap
            // of two adjacent characters, with everything after it equal.
            if (i !== first + 1 || a[first] !== b[i] || a[i] !== b[first]) return false;
            return a.slice(i + 1) === b.slice(i + 1);
        }
        return true;
    }

    // One character longer: the longer term must equal the shorter with one
    // character removed.
    const [longer, shorter] = lengthGap === 1 ? [a, b] : [b, a];
    let skipped = false;
    for (let i = 0, j = 0; j < shorter.length; i += 1, j += 1) {
        if (longer[i] === shorter[j]) continue;
        if (skipped) return false;
        skipped = true;
        j -= 1;
    }
    return true;
};
