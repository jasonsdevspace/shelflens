import { normalize } from '@jasonsdevspace/shelflens';
import type { Catalog } from '@shelflens/catalog';

/**
 * Completions for a phrase still being typed.
 *
 * Drawn from the catalog's own words, names, brands and categories, as they
 * are written, so a suggestion reads "sneakers" and never the stemmed
 * "sneaker" the index holds. Each word carries how many products use it,
 * and the most used come first.
 */
export interface Completions {
    complete(phrase: string, limit: number): string[];
}

const WORD = /[a-z0-9][a-z0-9-]*/g;

export const createCompletions = (catalog: Catalog): Completions => {
    const counts = new Map<string, number>();
    const names = new Map(catalog.categories.map((category) => [category.id, category.name]));
    for (const product of catalog.products) {
        const texts = [
            product.name,
            product.brand,
            ...product.categoryPath.map((id) => names.get(id) ?? ''),
        ];
        const seen = new Set<string>();
        for (const text of texts) {
            for (const word of normalize(text).match(WORD) ?? []) {
                if (word.length < 2 || seen.has(word)) continue;
                seen.add(word);
                counts.set(word, (counts.get(word) ?? 0) + 1);
            }
        }
    }
    const words = [...counts.keys()].sort();

    const complete = (phrase: string, limit: number): string[] => {
        const typed = normalize(phrase).match(WORD) ?? [];
        const last = typed.at(-1);
        if (!last || limit <= 0) return [];
        const before = typed.slice(0, -1).join(' ');
        return words
            .filter((word) => word.startsWith(last) && word !== last)
            .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b))
            .slice(0, limit)
            .map((word) => (before ? `${before} ${word}` : word));
    };

    return { complete };
};
