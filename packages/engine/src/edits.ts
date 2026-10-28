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
/** Same length: at most one substitution, or one swap of adjacent characters. */
const sameLengthWithinOneEdit = (a: string, b: string): boolean => {
    let first = -1;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] === b[i]) continue;
        if (first === -1) {
            first = i;
            continue;
        }
        // A second mismatch is allowed only as the other half of a swap of
        // two adjacent characters, with everything after it equal.
        const swapped = i === first + 1 && a[first] === b[i] && a[i] === b[first];
        return swapped && a.slice(i + 1) === b.slice(i + 1);
    }
    return true;
};

/** One character longer: the longer term is the shorter with one character added. */
const oneLongerWithinOneEdit = (longer: string, shorter: string): boolean => {
    let skipped = false;
    for (let i = 0, j = 0; j < shorter.length; i += 1, j += 1) {
        if (longer[i] === shorter[j]) continue;
        if (skipped) return false;
        skipped = true;
        j -= 1;
    }
    return true;
};

export const withinOneEdit = (a: string, b: string): boolean => {
    if (a === b) return true;
    const lengthGap = a.length - b.length;
    if (lengthGap === 0) return sameLengthWithinOneEdit(a, b);
    if (lengthGap === 1) return oneLongerWithinOneEdit(a, b);
    if (lengthGap === -1) return oneLongerWithinOneEdit(b, a);
    return false;
};

/** One row of the edit table: the cost of each prefix of `b` against the first `i` characters of `a`. */
interface Rows {
    readonly previous2: number[];
    readonly previous: number[];
}

const nextRow = (a: string, b: string, i: number, { previous2, previous }: Rows) => {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let value = Math.min(
            (previous[j] ?? 0) + 1,
            (current[j - 1] ?? 0) + 1,
            (previous[j - 1] ?? 0) + cost
        );
        const swapped = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
        if (swapped) value = Math.min(value, (previous2[j - 2] ?? 0) + 1);
        current.push(value);
    }
    return current;
};

/**
 * Whether two terms are within so many edits of each other, counting a
 * swap of adjacent characters as one.
 *
 * The general question, for the suggestion a page makes when a search
 * found nothing: the one-typo pass has already failed by then, and two
 * typos is as far as a suggestion is believable. Computed row by row
 * with the usual table, and abandoned as soon as a whole row is past the
 * limit, since most of the vocabulary is nowhere near.
 */
export const withinEdits = (a: string, b: string, max: number): boolean => {
    if (Math.abs(a.length - b.length) > max) return false;
    if (max <= 0) return a === b;
    if (max === 1) return withinOneEdit(a, b);
    let previous2: number[] = [];
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
        const current = nextRow(a, b, i, { previous2, previous });
        if (Math.min(...current) > max) return false;
        previous2 = previous;
        previous = current;
    }
    return (previous[b.length] ?? Infinity) <= max;
};
