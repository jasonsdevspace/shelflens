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
    // Entries by their first term, longest phrase first, so the most
    // specific rule wins where two could apply at one position.
    const entries = new Map<string, Entry[]>();
    const add = (phrase: readonly string[], alternatives: readonly (readonly string[])[]) => {
        const first = phrase[0];
        if (first === undefined) return;
        const seen = new Set([key(phrase)]);
        const kept = alternatives.filter((alt) => !seen.has(key(alt)) && seen.add(key(alt)));
        const list = entries.get(first) ?? [];
        list.push({ phrase, alternatives: kept });
        list.sort((a, b) => b.phrase.length - a.phrase.length);
        entries.set(first, list);
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
