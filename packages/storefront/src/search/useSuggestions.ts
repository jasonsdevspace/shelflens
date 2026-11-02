import { useEffect, useState } from 'react';

import { useQuery } from '../app/useQuery.js';
import type { GraphQLClient } from '../client/graphql.js';
import { SuggestDocument, type SuggestQuery } from '../generated/operations.js';

/**
 * Suggestions for the phrase in the search box, through the query hook every
 * other question the page asks goes through.
 *
 * Two things keep this honest under real typing. The phrase asked about
 * waits for a short pause, so five quick keystrokes cost one request rather
 * than five. And the query hook lets only the newest request set the
 * result, so a slow early response can never overwrite a fast later one.
 * The previous suggestions stay on screen while the next request is in
 * flight, which is why the result carries the phrase it answers.
 */

/** How long the input must be quiet before a request is sent. */
export const DEBOUNCE_MS = 100;

/** Below this many characters nothing is asked, matching the documented minimum. */
const MIN_CHARACTERS = 2;

const SUGGESTION_LIMIT = 5;

export type Suggestions = SuggestQuery['suggest'];

export interface SuggestionState {
    /** The suggestions last received, and the phrase they answer. */
    readonly answered: { readonly phrase: string; readonly suggestions: Suggestions } | undefined;
    /** Whether a request for the current phrase is pending or in flight. */
    readonly loading: boolean;
    readonly error: string | undefined;
}

export const isAskable = (phrase: string): boolean => phrase.trim().length >= MIN_CHARACTERS;

/**
 * The phrase once typing has paused on it, and nothing until it first has.
 * A phrase too short to ask about is let go at once, so typing back past it
 * waits for the pause again rather than asking the old phrase anew.
 */
const useSettled = (phrase: string): string | undefined => {
    const [settled, setSettled] = useState<string>();
    const askable = isAskable(phrase);
    // Let go during the render that sees the short phrase, as React adjusts state to a prop.
    if (!askable && settled !== undefined) setSettled(undefined);
    useEffect(() => {
        if (!askable) return;
        const timer = setTimeout(() => setSettled(phrase.trim()), DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [phrase, askable]);
    return settled;
};

export const useSuggestions = (client: GraphQLClient, phrase: string): SuggestionState => {
    const wanted = phrase.trim();
    const askable = isAskable(wanted);
    const settled = useSettled(phrase);
    // A phrase too short to ask about stops at once, rather than after the pause.
    const asked = askable && settled !== undefined && isAskable(settled) ? settled : undefined;
    const { data, answers, error } = useQuery(
        client,
        SuggestDocument,
        asked === undefined ? undefined : { phrase: asked, limit: SUGGESTION_LIMIT }
    );
    const answered =
        askable && data && answers
            ? { phrase: answers.phrase, suggestions: data.suggest }
            : undefined;
    // A failure is told only while the box still holds the phrase that failed.
    const failed = askable && asked === wanted ? error : undefined;
    return {
        answered,
        // A failed request is over, not pending.
        loading: askable && answered?.phrase !== wanted && failed === undefined,
        error: failed,
    };
};
