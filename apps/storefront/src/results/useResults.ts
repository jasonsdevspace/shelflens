import type { Rule } from '@jasonsdevspace/shelflens';
import { useEffect, useState } from 'react';

import { type SearchState, toSearchInput } from '../app/url.js';
import { useQuery } from '../app/useQuery.js';
import type { GraphQLClient } from '../client/graphql.js';
import {
    PreviewDocument,
    type PreviewQuery,
    type PreviewQueryVariables,
    SearchDocument,
    type SearchQuery,
    type SearchQueryVariables,
    type TypedDocumentString,
} from '../generated/operations.js';
import { fold, recentSearches, rememberSearch } from '../search/recent.js';
import { toRuleInput } from './rule-input.js';

/** The page's one question, which is a search or a preview of one, asked through one hook. */
type Asked = TypedDocumentString<
    SearchQuery | PreviewQuery,
    SearchQueryVariables | PreviewQueryVariables
>;

/**
 * The one request the page is read from: the search the URL says, or a
 * preview of it with the panel's draft in place of the store's rules.
 * Both go through one hook, so the answer before stays on the page while
 * the next is on its way, and the panel beside the results is never
 * unmounted by the preview it asked for.
 */
export const useResults = (
    client: GraphQLClient,
    state: SearchState,
    draft: readonly Rule[] | undefined
) => {
    const previewing = state.rules === true && draft !== undefined;
    const input = { input: toSearchInput(state), explain: state.explain ?? false };
    // The two documents answer the same shape under different names, which is
    // all the hook needs, and more than the generated types say in one breath.
    const document = (previewing ? PreviewDocument : SearchDocument) as Asked;
    // The draft is the engine's own rules, sent as the schema's RuleInput.
    const variables: SearchQueryVariables | PreviewQueryVariables = previewing
        ? { ...input, rules: draft.map(toRuleInput) }
        : input;
    const { data, loading, error, retry } = useQuery(client, document, variables);
    const result = data && ('preview' in data ? data.preview : data.search);
    // Whether the result is the answer to this request, rather than one before it.
    const answered = !loading && error === undefined;
    // Whether the result is the store's own answer to this search, not a preview.
    const own = answered && !previewing;
    return { result, loading, error, retry, previewing, answered, own };
};

export type Result = NonNullable<ReturnType<typeof useResults>['result']>;

/**
 * The ids of the rules the store applied or set aside, as one array that
 * changes only when they do, and nothing until the store has answered once.
 */
export const useAppliedRules = (
    result: Result | undefined,
    /** Whether the result is the answer to the current request, rather than one before it. */
    answered: boolean,
    previewing: boolean,
    search: string
): readonly string[] | undefined => {
    const ids =
        !answered || previewing || !result
            ? undefined
            : // A rule that pins and hides is in both under a sort, and is listed once.
              [
                  ...new Set([
                      ...result.merchandising.applied,
                      ...result.merchandising.setAside.map((rule) => rule.ruleId),
                  ]),
              ];
    // The last answer from the store itself for this search, kept through a preview
    // and through the request after it, so the list beside the results never blanks
    // or shows a draft's. Another search starts over. It is state, so the same array
    // comes back until the ids themselves change.
    const [kept, setKept] = useState({ search, ids });
    const differs = (a: readonly string[], b: readonly string[]) =>
        a.length !== b.length || a.some((id, i) => id !== b[i]);
    if (kept.search !== search) setKept({ search, ids });
    else if (ids !== undefined && (kept.ids === undefined || differs(ids, kept.ids))) {
        setKept({ search, ids });
    }
    return kept.search === search ? kept.ids : ids;
};

/**
 * A phrase joins this browser's recent searches once its search has found
 * something, so a typo that found nothing is never offered again, and the
 * nothing-found page stays a page with a way forward rather than a place
 * to return to.
 */
export const useRememberedSearch = (
    phrase: string | undefined,
    result: Result | undefined,
    /**
     * Whether the result is the store's own answer to this search, not a
     * preview or an older one.
     */
    own: boolean,
    /** Counts the searches submitted, so one run again after a clear joins the list again. */
    searched: number
) => {
    // Close matches for a misspelling are the store's work, not a search to run again.
    const found =
        own && result !== undefined && result.total > 0 && result.matching !== 'CORRECTED';
    useEffect(() => {
        // A page, a filter or a sort under the phrase is the same search, already first.
        if (phrase && found && fold(recentSearches()[0] ?? '') !== fold(phrase)) {
            rememberSearch(phrase);
        }
    }, [phrase, found, searched]);
};
