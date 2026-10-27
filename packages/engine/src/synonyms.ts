import { tokenize } from './normalize.js';
import type { SynonymRule } from './types.js';

/**
 * Query-time synonym expansion.
 *
 * Synonyms widen the query rather than the index, so a rule added by a
 * merchandiser takes effect on the next search without reindexing. Each
 * rule's terms go through the same tokenizer as everything else, so a rule
 * written as "T-shirt" lines up with the index's terms for it.
 *
 * A multi-word synonym such as "baseball cap" becomes the terms it
 * tokenizes to, all of which a document must then contain.
 */
export type Expansion = readonly string[];

export interface SynonymTable {
    /** For a query term, the alternatives it may also match. */
    expansionsOf(term: string): readonly Expansion[];
}

export const buildSynonyms = (rules: readonly SynonymRule[]): SynonymTable => {
    const table = new Map<string, Expansion[]>();
    const add = (from: string, to: Expansion) => {
        const list = table.get(from) ?? [];
        if (!list.some((existing) => existing.join(' ') === to.join(' '))) list.push(to);
        table.set(from, list);
    };

    for (const rule of rules) {
        if (rule.kind === 'one-way') {
            for (const from of tokenize(rule.from)) add(from, tokenize(rule.to));
            continue;
        }
        const tokenized = rule.terms.map(tokenize);
        tokenized.forEach((fromTerms, i) => {
            for (const from of fromTerms) {
                tokenized.forEach((to, j) => {
                    if (i !== j) add(from, to);
                });
            }
        });
    }

    return { expansionsOf: (term) => table.get(term) ?? [] };
};
