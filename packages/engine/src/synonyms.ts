import { phraseVariants } from './normalize.js';
import type { SynonymRule } from './types.js';

/**
 * Query-time synonyms, applied to phrases rather than words.
 *
 * Synonyms widen the query rather than the index, so a rule added by a
 * merchandiser takes effect on the next search without reindexing.
 *
 * A rule is matched against the query as a whole phrase, and the phrase it
 * matched becomes one unit of the query that any of its alternatives may
 * satisfy. Expanding word by word instead would let two query words map
 * to the same indexed word and count it twice: "t shirt", with "t-shirt"
 * equivalent to "tee", would credit a Tee once for "t" and again for
 * "shirt", and rank it above an actual T-Shirt.
 */

/** One piece of the query: the terms typed, and what may stand in for them. */
export interface QueryUnit {
    readonly terms: readonly string[];
    readonly alternatives: readonly (readonly string[])[];
}

export interface SynonymTable {
    rewrite(terms: readonly string[]): QueryUnit[];
}

interface Entry {
    readonly phrase: readonly string[];
    readonly alternatives: readonly (readonly string[])[];
}

const key = (terms: readonly string[]) => terms.join(' ');

const startsWith = (terms: readonly string[], at: number, phrase: readonly string[]): boolean =>
    phrase.every((term, i) => terms[at + i] === term);

export const buildSynonyms = (rules: readonly SynonymRule[]): SynonymTable => {
    // One entry per phrase, which every rule on the phrase adds to, because
    // rewrite reads only the first entry that fits, and a one-way rule from
    // "tshirt" would otherwise hide the "tee" an equivalence of "t-shirt"
    // and "tee" gives it. An alternative the entry already has, or the
    // phrase itself, is left out, so each reading is tried once.
    const byPhrase = new Map<
        string,
        { phrase: readonly string[]; alternatives: Map<string, readonly string[]> }
    >();
    const add = (phrase: readonly string[], alternatives: readonly (readonly string[])[]) => {
        if (phrase.length === 0) return;
        const own = key(phrase);
        const entry = byPhrase.get(own) ?? { phrase, alternatives: new Map() };
        for (const alt of alternatives) {
            const named = key(alt);
            if (named !== own && !entry.alternatives.has(named)) entry.alternatives.set(named, alt);
        }
        byPhrase.set(own, entry);
    };

    for (const rule of rules) {
        if (rule.kind === 'one-way') {
            for (const phrase of phraseVariants(rule.from)) add(phrase, phraseVariants(rule.to));
            continue;
        }
        const variants = rule.terms.map(phraseVariants);
        variants.forEach((own, i) => {
            const others = variants.flatMap((other, j) => (i === j ? [] : other));
            for (const phrase of own) add(phrase, others);
        });
    }

    // Entries by their first term, longest phrase first, so the most
    // specific rule wins where two could apply at one position.
    const entries = new Map<string, Entry[]>();
    for (const { phrase, alternatives } of byPhrase.values()) {
        const first = phrase[0] ?? '';
        const list = entries.get(first) ?? [];
        list.push({ phrase, alternatives: [...alternatives.values()] });
        entries.set(first, list);
    }
    for (const list of entries.values()) list.sort((a, b) => b.phrase.length - a.phrase.length);

    const rewrite = (terms: readonly string[]): QueryUnit[] => {
        const units: QueryUnit[] = [];
        for (let i = 0; i < terms.length;) {
            const term = terms[i] ?? '';
            const entry = (entries.get(term) ?? []).find((e) => startsWith(terms, i, e.phrase));
            if (entry) {
                units.push({ terms: entry.phrase, alternatives: entry.alternatives });
                i += entry.phrase.length;
            } else {
                units.push({ terms: [term], alternatives: [] });
                i += 1;
            }
        }
        return units;
    };

    return { rewrite };
};
