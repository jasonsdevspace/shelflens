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
    // What each phrase leads to directly, by every rule on it. One entry per
    // phrase, because rewrite reads only the first entry that fits, and a
    // one-way rule from "tshirt" would otherwise hide the "tee" an
    // equivalence of "t-shirt" and "tee" gives it.
    const byPhrase = new Map<
        string,
        { phrase: readonly string[]; next: Map<string, readonly string[]> }
    >();
    const add = (phrase: readonly string[], alternatives: readonly (readonly string[])[]) => {
        if (phrase.length === 0) return;
        const own = key(phrase);
        const entry = byPhrase.get(own) ?? { phrase, next: new Map() };
        for (const alt of alternatives) if (alt.length > 0) entry.next.set(key(alt), alt);
        byPhrase.set(own, entry);
    };

    /**
     * Every phrase this one leads to through the rules, nearest first, so
     * rules chain through a phrase they share. A raincoat that is a rain
     * shell, and a rain shell that is an anorak, is an anorak. The phrase's
     * own other spellings are offered too when a chain reaches them, since
     * leaving them out made what a phrase offered depend on unrelated rules.
     * Each phrase is offered once, so each reading is tried once, and the
     * phrase itself is never offered.
     */
    const reachedFrom = (own: string): (readonly string[])[] => {
        const reached = new Map<string, readonly string[]>();
        const queue = [own];
        for (let at = 0; at < queue.length; at += 1) {
            for (const [named, phrase] of byPhrase.get(queue[at] ?? '')?.next ?? []) {
                if (named === own || reached.has(named)) continue;
                reached.set(named, phrase);
                queue.push(named);
            }
        }
        return [...reached.values()];
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

    // Entries by their first term, longest phrase first, so the longest phrase
    // wins where two could apply at one position.
    const entries = new Map<string, Entry[]>();
    for (const [own, { phrase }] of byPhrase) {
        const first = phrase[0] ?? '';
        const list = entries.get(first) ?? [];
        list.push({ phrase, alternatives: reachedFrom(own) });
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
