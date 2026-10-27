import { useEffect, useRef, useState } from 'react';

import type { GraphQLClient } from '../client/graphql.js';
import { createLatest } from '../client/latest.js';
import type { TypedDocumentString } from '../generated/operations.js';

/**
 * One query, kept current.
 *
 * The variables are the key. When they change a new request starts and the
 * one before is abandoned, so only the newest answer is ever shown. The
 * previous answer stays available while the next is in flight, so a page
 * can dim rather than empty itself between two filters.
 */

export interface QueryState<Result> {
    /** The newest answer received, which may be for the variables before these. */
    readonly data: Result | undefined;
    /** Whether the answer for the current variables is still on its way. */
    readonly loading: boolean;
    readonly error: string | undefined;
}

export const useQuery = <Result, Variables>(
    client: GraphQLClient,
    document: TypedDocumentString<Result, Variables>,
    /** The variables, or nothing to ask nothing. */
    variables: Variables | undefined
): QueryState<Result> => {
    const key = variables === undefined ? undefined : JSON.stringify(variables);
    const [answered, setAnswered] = useState<{ key: string; data: Result }>();
    const [failed, setFailed] = useState<{ key: string; message: string }>();
    const latest = useRef(createLatest());

    useEffect(() => {
        if (key === undefined) {
            latest.current.cancel();
            return;
        }
        void latest.current
            .run((signal) => client.query(document, JSON.parse(key) as Variables, { signal }))
            .then((outcome) => {
                if (!outcome.stale) setAnswered({ key, data: outcome.value });
            })
            .catch((error: unknown) => {
                setFailed({
                    key,
                    message: error instanceof Error ? error.message : 'the request failed',
                });
            });
    }, [client, document, key]);

    return {
        data: key === undefined ? undefined : answered?.data,
        loading: key !== undefined && answered?.key !== key && failed?.key !== key,
        error: failed !== undefined && failed.key === key ? failed.message : undefined,
    };
};
