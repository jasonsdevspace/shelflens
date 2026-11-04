import { useCallback, useEffect, useState } from 'react';

import type { GraphQLClient, QueryVariables } from '../client/graphql.js';
import { createLatest } from '../client/latest.js';
import type { TypedDocumentString } from '../generated/operations.js';

/**
 * One query, kept current.
 *
 * The variables and the client are the key. When either changes a new
 * request starts and the one before is abandoned, so only the newest
 * answer is ever shown. The previous answer stays available while the
 * next is in flight, so a page can dim rather than empty itself between
 * two filters, or between two viewers.
 */

export interface QueryState<Result, Variables = unknown> {
    /** The newest answer received, which may be for the variables before these. */
    readonly data: Result | undefined;
    /** The variables that answer was for, so a caller can tell an earlier answer from this one. */
    readonly answers: Variables | undefined;
    /** Whether the answer for the current variables is still on its way. */
    readonly loading: boolean;
    readonly error: string | undefined;
    /** Asks again after a failure. */
    readonly retry: () => void;
}

export const useQuery = <Result, Variables extends QueryVariables>(
    client: GraphQLClient,
    document: TypedDocumentString<Result, Variables>,
    /** The variables, or nothing to ask nothing. */
    variables: Variables | undefined,
    /** A count the caller raises to ask again, the same variables included. */
    { again = 0 }: { readonly again?: number } = {}
): QueryState<Result, Variables> => {
    const key = variables === undefined ? undefined : JSON.stringify(variables);
    const [answered, setAnswered] = useState<{
        client: GraphQLClient;
        key: string;
        variables: Variables;
        data: Result;
    }>();
    const [failed, setFailed] = useState<{ client: GraphQLClient; key: string; message: string }>();
    const [latest] = useState(createLatest);
    // Counts the times asked again, so the same question is sent once more.
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => {
        setFailed(undefined);
        setAttempt((n) => n + 1);
    }, []);
    const current = (state: { client: GraphQLClient; key: string } | undefined) =>
        state?.client === client && state.key === key;

    useEffect(() => {
        if (key === undefined) {
            latest.cancel();
            return;
        }
        // The key is these variables written as JSON, so it reads back as them.
        const variables = JSON.parse(key) as Variables;
        void latest
            .run((signal) => client.query(document, variables, { signal }))
            .then((outcome) => {
                if (outcome.stale) return;
                setAnswered({ client, key, variables, data: outcome.value });
                // An answer for the question ends a failure of it, however it was asked again.
                setFailed((before) =>
                    before?.client === client && before.key === key ? undefined : before
                );
            })
            .catch((error: unknown) => {
                setFailed({
                    client,
                    key,
                    message: error instanceof Error ? error.message : 'the request failed',
                });
            });
        // A component that goes takes its question with it.
        return () => {
            latest.cancel();
        };
    }, [client, document, key, attempt, again, latest]);

    return {
        data: key === undefined ? undefined : answered?.data,
        answers: key === undefined ? undefined : answered?.variables,
        loading: key !== undefined && !current(answered) && !current(failed),
        error: current(failed) ? failed?.message : undefined,
        retry,
    };
};
