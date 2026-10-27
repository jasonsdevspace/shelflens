/**
 * Turning text into comparable terms.
 *
 * Every rule here runs on the catalog when it is indexed and on the query
 * when it is searched, through the same functions. That symmetry is the
 * whole point. A rule applied on one side only makes matches silently
 * disappear: "Café" indexed with its accent never matches "cafe" typed
 * without it.
 */

/** Strips accents, so "café" and "cafe" are the same word. */
export const foldAccents = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '');

export const normalize = (text: string): string => foldAccents(text).toLowerCase();

/**
 * A light English stemmer, for plurals only.
 *
 * "shoes" and "shoe" should be one term, and so should "dresses" and
 * "dress". Full stemming would also fold "running" into "run", which is
 * more than a product catalog wants: a Trail Runner is not a run. Short
 * words are left alone, since "bus" is not the plural of "bu".
 */
export const stem = (term: string): string => {
    if (term.length <= 3) return term;
    if (term.endsWith('ies')) return `${term.slice(0, -3)}y`;
    if (term.endsWith('ss') || term.endsWith('us') || term.endsWith('is')) return term;
    if (/(?:s|x|z|ch|sh)es$/.test(term)) return term.slice(0, -2);
    if (term.endsWith('s')) return term.slice(0, -1);
    return term;
};

/**
 * Splits text into terms.
 *
 * Hyphenated words produce both their parts and the joined form, so
 * "T-Shirt" is found by "t shirt", "t-shirt" and "tshirt" alike. Apostrophes
 * are dropped rather than split on, so "men's" becomes "mens" and then
 * "men". Everything else that is not a letter or digit separates words.
 */
export const tokenize = (text: string): string[] => {
    const terms: string[] = [];
    for (const chunk of normalize(text)
        .replace(/'/g, '')
        .split(/[^a-z0-9-]+/)) {
        const parts = chunk.split('-').filter((part) => part.length > 0);
        if (parts.length === 0) continue;
        if (parts.length > 1) terms.push(parts.join(''));
        terms.push(...parts);
    }
    return terms.map(stem);
};
