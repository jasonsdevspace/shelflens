import { useEffect, useRef, useState } from 'react';

import type { GraphQLClient } from '../client/graphql.js';
import { createLatest } from '../client/latest.js';
import { SuggestDocument, type SuggestQuery } from '../generated/operations.js';

/**
 * Suggestions for the phrase in the search box.
 *
 * Two things keep this honest under real typing. The request waits for a
 * short pause, so five quick keystrokes cost one request rather than five.
 * And only the newest request may set the result, so a slow early response
 * can never overwrite a fast later one. The previous suggestions stay on
 * screen while the next request is in flight, which is why the result
 * carries the phrase it answers.
 */

/** How long the input must be quiet before a request is sent. */
export const DEBOUNCE_MS = 100;

/** Below this many characters nothing is asked, matching the documented minimum. */
export const MIN_CHARACTERS = 2;

export const SUGGESTION_LIMIT = 5;

export type Suggestions = SuggestQuery['suggest'];

export interface SuggestionState {
    /** The suggestions last received, and the phrase they answer. */
    readonly answered: { readonly phrase: string; readonly suggestions: Suggestions } | undefined;
    /** Whether a request for the current phrase is pending or in flight. */
    readonly loading: boolean;
    readonly error: string | undefined;
}

export const isAskable = (phrase: string): boolean => phrase.trim().length >= MIN_CHARACTERS;

export const useSuggestions = (client: GraphQLClient, phrase: string): SuggestionState => {
    const [answered, setAnswered] = useState<SuggestionState['answered']>();
    // A failure, and the phrase it failed for, so a new phrase is not told of an old one.
    const [failed, setFailed] = useState<{ readonly phrase: string; readonly message: string }>();
    const latest = useRef(createLatest());

    useEffect(() => {
        const wanted = phrase.trim();
        if (!isAskable(wanted)) {
            latest.current.cancel();
            return;
        }
        const timer = setTimeout(() => {
            void latest.current
                .run((signal) =>
                    client.query(
                        SuggestDocument,
                        { phrase: wanted, limit: SUGGESTION_LIMIT },
                        { signal }
                    )
                )
                .then((outcome) => {
                    if (outcome.stale) return;
                    setAnswered({ phrase: wanted, suggestions: outcome.value.suggest });
                    setFailed(undefined);
                })
                .catch((failure: unknown) => {
                    setFailed({
                        phrase: wanted,
                        message: failure instanceof Error ? failure.message : 'the search failed',
                    });
                });
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [client, phrase]);

    const askable = isAskable(phrase);
    const wanted = phrase.trim();
    const error = askable && failed?.phrase === wanted ? failed.message : undefined;
    return {
        answered: askable ? answered : undefined,
        // A failed request is over, not pending.
        loading: askable && answered?.phrase !== wanted && error === undefined,
        error,
    };
};
