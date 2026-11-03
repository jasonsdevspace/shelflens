/** What comes before the word at this place in a list of this length, so a list can hold links. */
export const listSeparator = (index: number, length: number): string => {
    if (index === 0) return '';
    return index === length - 1 ? ' and ' : ', ';
};

/** Words as a list is read aloud: "a", "a and b", "a, b and c". */
export const listOf = (words: readonly string[]): string =>
    words.map((word, index) => listSeparator(index, words.length) + word).join('');
