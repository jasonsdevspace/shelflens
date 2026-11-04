import {
    type ASTVisitor,
    type DocumentNode,
    execute,
    type FieldNode,
    GraphQLError,
    type GraphQLSchema,
    isAbstractType,
    isObjectType,
    parse,
    specifiedRules,
    validate,
    type ValidationContext,
    type ValidationRule,
} from 'graphql';

import type { Context, Store, Viewer } from './context.js';
import { INTERNAL_CODE, type StoreError, USER_CODES } from './errors.js';
import type { EventStore } from './events.js';
import type { Resolvers } from './generated/schema.js';
import { isOneOf } from './guards.js';
import { touch, trimOldest } from './recent.js';
import { resolvers } from './resolvers.js';
import { buildStoreSchema } from './schema.js';

/**
 * Running one request against the store.
 *
 * Parsing, validation and execution are the reference library's. What is
 * added here is what a public API needs around them: limits on how deep
 * and how wide a query may be, so a crafted request cannot do unbounded
 * work, and errors that never carry internal detail to a client.
 */

export interface StoreRequest {
    readonly query: string;
    readonly variables?: Readonly<Record<string, unknown>>;
    readonly operationName?: string;
}

export interface StoreResponse {
    readonly data?: Record<string, unknown> | null;
    readonly errors?: readonly StoreError[];
    readonly extensions?: {
        /** The answer depends on the events collected so far, so no cache may keep it. */
        readonly volatile?: boolean;
    };
}

interface Limits {
    /** How deeply fields may nest. The results page needs six. */
    readonly maxDepth: number;
    /** How many fields one query may select, aliases included. */
    readonly maxFields: number;
}

const DEFAULT_LIMITS: Limits = { maxDepth: 8, maxFields: 200 };

/**
 * Attaches the resolvers to the schema the SDL built, field by field.
 *
 * The generated resolver types are not graphql-js's own, so each resolver is
 * cast as it is attached. The facet type's resolver is typed to allow null,
 * which graphql-js does not, and Object.entries gives each field's resolver as
 * any. The API tests reach the resolvers through queries, each kind of facet
 * among them, so a resolver that does not fit fails there.
 */
const attach = (schema: GraphQLSchema, map: Resolvers): GraphQLSchema => {
    for (const [typeName, fields] of Object.entries(map)) {
        const type = schema.getType(typeName);
        if (!type) continue;
        if (isAbstractType(type) && '__resolveType' in fields) {
            type.resolveType = fields.__resolveType as typeof type.resolveType;
            continue;
        }
        if (!isObjectType(type)) continue;
        const own = type.getFields();
        for (const [fieldName, resolver] of Object.entries(fields)) {
            const field = own[fieldName];
            if (field && typeof resolver === 'function') {
                field.resolve = resolver as typeof field.resolve;
            }
        }
    }
    return schema;
};

/** Refuses a query that nests deeper or selects wider than the limits allow. */
const withinLimits =
    (limits: Limits) =>
    (context: ValidationContext): ASTVisitor => {
        let depth = 0;
        let fields = 0;
        return {
            Field: {
                enter(node: FieldNode) {
                    depth += 1;
                    fields += 1;
                    if (depth > limits.maxDepth) {
                        context.reportError(
                            new GraphQLError(
                                `the query nests deeper than ${limits.maxDepth} levels`,
                                {
                                    nodes: node,
                                    extensions: { code: 'QUERY_TOO_DEEP' },
                                }
                            )
                        );
                    }
                    if (fields === limits.maxFields + 1) {
                        context.reportError(
                            new GraphQLError(
                                `the query selects more than ${limits.maxFields} fields`,
                                {
                                    nodes: node,
                                    extensions: { code: 'QUERY_TOO_WIDE' },
                                }
                            )
                        );
                    }
                },
                leave() {
                    depth -= 1;
                },
            },
        };
    };

export interface StoreApi {
    readonly schema: GraphQLSchema;
    /** The store's version, part of every cache key. */
    readonly version: string;
    /** Answers a request, as of the time the host says it arrived, which rules with a window read. */
    run(request: StoreRequest, viewer: Viewer, now: Date): Promise<StoreResponse>;
}

/** What a client is told when a resolver fails for a reason that is ours. */
export const INTERNAL_MESSAGE = 'Something went wrong on our side.';

/** Keeps a user's mistakes as they are, and replaces everything else. */
const shaped = (error: GraphQLError): StoreError => {
    const code = error.extensions['code'];
    const isUserError = isOneOf(USER_CODES, code);
    // Only a resolver's failure has a path. Anything without one was found
    // before any field ran: validation, or a variable that did not fit.
    const fromRequest = error.path === undefined;
    const message = isUserError || fromRequest ? error.message : INTERNAL_MESSAGE;
    return {
        message,
        extensions: {
            code: isUserError ? code : fromRequest ? 'GRAPHQL_VALIDATION_FAILED' : INTERNAL_CODE,
        },
        ...(error.path && { path: error.path }),
    };
};

export interface StoreApiOptions {
    readonly limits?: Limits;
    /** The events the host collected, for the fields that read them. */
    readonly events?: EventStore | undefined;
}

/**
 * The schema with its resolvers attached, built once.
 *
 * It describes the store's shape, not one store's contents, which reach the
 * resolvers through the context. A store built again for a saved rule or a
 * visit's clicks serves the same schema, so what was parsed and validated
 * against it still holds.
 */
let schemaOnce: GraphQLSchema | undefined;
const storeSchema = (): GraphQLSchema => (schemaOnce ??= attach(buildStoreSchema(), resolvers));

/** How many valid queries are kept. The demo's page sends a handful. */
export const KEPT_QUERIES = 64;

/**
 * The longest query kept, in characters. The page's longest operation is
 * about a kilobyte, and this bounds what the kept set can hold however
 * large the queries a host accepts.
 */
export const KEPT_QUERY_LENGTH = 4096;

/** What is kept for one set of limits: its validation rules, and its queries. */
interface Kept {
    readonly rules: readonly ValidationRule[];
    readonly documents: Map<string, DocumentNode>;
}

/**
 * Queries already parsed and validated, by their text, kept per set of
 * limits, since a query within one set may be past another.
 *
 * The page sends the same few operations all visit, and parsing and
 * validating one costs more than answering it from the index. Only a query
 * that validated is kept, up to a length, the most recently used first, so
 * a broken query is never kept and the set never grows past its bound. A
 * host that also takes full queries can see the page's operations pushed
 * out by enough different ones, and reads them again when they return.
 */
const kept = new Map<string, Kept>();

const keptFor = (limits: Limits): Kept => {
    const id = `${String(limits.maxDepth)}:${String(limits.maxFields)}`;
    let found = kept.get(id);
    if (!found) {
        found = { rules: [...specifiedRules, withinLimits(limits)], documents: new Map() };
        kept.set(id, found);
    }
    return found;
};

type Prepared =
    { readonly document: DocumentNode } | { readonly errors: NonNullable<StoreResponse['errors']> };

/** The query parsed and validated, from what was kept when it was seen before. */
const prepare = (query: string, limits: Limits): Prepared => {
    const { rules, documents } = keptFor(limits);
    const known = documents.get(query);
    if (known) {
        touch(documents, query, known);
        return { document: known };
    }
    let document;
    try {
        document = parse(query);
    } catch (error) {
        const message =
            error instanceof GraphQLError ? error.message : 'the query could not be parsed';
        return { errors: [{ message, extensions: { code: 'GRAPHQL_PARSE_FAILED' } }] };
    }
    const problems = validate(storeSchema(), document, rules);
    if (problems.length > 0) return { errors: problems.map(shaped) };
    if (query.length <= KEPT_QUERY_LENGTH) {
        documents.set(query, document);
        trimOldest(documents, KEPT_QUERIES);
    }
    return { document };
};

export const createStoreApi = (
    store: Store,
    { limits = DEFAULT_LIMITS, events }: StoreApiOptions = {}
): StoreApi => {
    const schema = storeSchema();

    const run = async (
        request: StoreRequest,
        viewer: Viewer,
        now: Date
    ): Promise<StoreResponse> => {
        const prepared = prepare(request.query, limits);
        if ('errors' in prepared) return { errors: prepared.errors };
        const { document } = prepared;

        const context: Context = { store, viewer, now, events, answer: { volatile: false } };
        const result = await execute({
            schema,
            document,
            contextValue: context,
            variableValues: request.variables ?? {},
            operationName: request.operationName ?? null,
        });
        return {
            ...(result.data !== undefined && { data: result.data }),
            ...(result.errors && { errors: result.errors.map(shaped) }),
            ...(context.answer.volatile && { extensions: { volatile: true } }),
        };
    };

    return { schema, version: store.version, run };
};
