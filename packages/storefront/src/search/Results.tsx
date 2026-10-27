import { useEffect, useRef, useState } from 'react';

import type { GraphQLClient } from '../client/graphql.js';
import { createLatest } from '../client/latest.js';
import { formatPriceRange } from '../format/money.js';
import { SearchDocument, type SearchQuery } from '../generated/operations.js';
import { Swatch } from './Swatch.jsx';

/**
 * The results for a submitted phrase: the first page, as a list.
 *
 * The facets, the sort and the URL state come with the results page. This
 * is the destination the popover needs in the meantime, and it keeps the
 * same rule as the popover: only the newest request may be shown.
 */

export interface ResultsProps {
    readonly client: GraphQLClient;
    readonly phrase: string;
    readonly onPick: (sku: string) => void;
}

type Result = SearchQuery['search'];

export const Results = ({ client, phrase, onPick }: ResultsProps) => {
    const [answered, setAnswered] = useState<{ phrase: string; result: Result }>();
    const [error, setError] = useState<string>();
    const latest = useRef(createLatest());

    useEffect(() => {
        void latest.current
            .run((signal) =>
                client.query(SearchDocument, { input: { phrase, pageSize: 20 } }, { signal })
            )
            .then((outcome) => {
                if (outcome.stale) return;
                setAnswered({ phrase, result: outcome.value.search });
                setError(undefined);
            })
            .catch((failure: unknown) => {
                setError(failure instanceof Error ? failure.message : 'the search failed');
            });
    }, [client, phrase]);

    if (error) {
        return (
            <p className="notice" role="alert">
                {error}
            </p>
        );
    }
    if (answered?.phrase !== phrase) {
        return <p className="notice">Searching for {phrase}.</p>;
    }
    const { result } = answered;
    return (
        <section className="results" aria-labelledby="results-heading">
            <h1 id="results-heading" className="results-heading">
                {result.total === 0
                    ? `Nothing matched "${phrase}"`
                    : `${result.total} results for "${phrase}"`}
                {result.matching === 'CORRECTED' && (
                    <span className="results-note"> showing close matches</span>
                )}
            </h1>
            <ul className="results-list">
                {result.items.map(({ product }) => (
                    <li key={product.sku} className="result">
                        <button
                            type="button"
                            className="result-button"
                            onClick={() => onPick(product.sku)}
                        >
                            <Swatch
                                color={product.colors[0]}
                                brand={product.brand.name}
                                size={56}
                            />
                            <span className="result-text">
                                <span className="result-name">{product.name}</span>
                                <span className="result-meta">
                                    {product.brand.name}
                                    {' · '}
                                    {formatPriceRange(product.price.min, product.price.max)}
                                </span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
};
