import { stripIgnoredCharacters } from 'graphql';

/** How many distinct query texts to remember the canonical form of. */
const MEMO_SIZE = 64;
const memo = new Map<string, string>();

/**
 * The query with only GraphQL's insignificant characters removed, so the
 * text inside a string value is left alone. A storefront sends the same
 * few query texts over and over, so the work is done once per text. A
 * query that cannot be lexed is kept as it is, so it still reaches the
 * API and comes back as the parse error it is.
 */
export const canonicalQuery = (query: string): string => {
    const known = memo.get(query);
    if (known !== undefined) return known;
    let stripped: string;
    try {
        stripped = stripIgnoredCharacters(query);
    } catch {
        stripped = query;
    }
    if (memo.size >= MEMO_SIZE) {
        const oldest = memo.keys().next().value;
        if (oldest !== undefined) memo.delete(oldest);
    }
    memo.set(query, stripped);
    return stripped;
};
