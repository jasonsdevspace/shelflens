import {
    type ASTVisitor,
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
} from 'graphql';

import type { Context, Store, Viewer } from './context.js';
import type { Resolvers } from './generated/schema.js';
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
    readonly errors?: readonly {
        readonly message: string;
        readonly extensions?: Readonly<Record<string, unknown>>;
        readonly path?: readonly (string | number)[];
    }[];
}

export interface Limits {
    /** How deeply fields may nest. The results page needs six. */
    readonly maxDepth: number;
    /** How many fields one query may select, aliases included. */
    readonly maxFields: number;
}

export const DEFAULT_LIMITS: Limits = { maxDepth: 8, maxFields: 200 };

/** Attaches the resolvers to the schema the SDL built, field by field. */
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

/** Whether a parsed request body is a request at all: an object with a query in it. */
export const isStoreRequest = (value: unknown): value is StoreRequest =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { query?: unknown }).query === 'string';

export interface StoreApi {
    readonly schema: GraphQLSchema;
    run(request: StoreRequest, viewer: Viewer, now?: Date): Promise<StoreResponse>;
}

/** What a client is told when a resolver fails for a reason that is ours. */
const INTERNAL_MESSAGE = 'Something went wrong on our side.';

/** Keeps a user's mistakes as they are, and replaces everything else. */
const shaped = (
    error: GraphQLError
): StoreResponse['errors'] extends readonly (infer E)[] | undefined ? E : never => {
    const code = error.extensions.code;
    const isUserError =
        typeof code === 'string' &&
        ['BAD_USER_INPUT', 'QUERY_TOO_DEEP', 'QUERY_TOO_WIDE'].includes(code);
    // Only a resolver's failure has a path. Anything without one was found
    // before any field ran: validation, or a variable that did not fit.
    const fromRequest = error.path === undefined;
    const message = isUserError || fromRequest ? error.message : INTERNAL_MESSAGE;
    return {
        message,
        extensions: {
            code: isUserError ? code : fromRequest ? 'GRAPHQL_VALIDATION_FAILED' : 'INTERNAL',
        },
        ...(error.path && { path: error.path }),
    };
};

export const createStoreApi = (store: Store, limits: Limits = DEFAULT_LIMITS): StoreApi => {
    const schema = attach(buildStoreSchema(), resolvers);
    const rules = [...specifiedRules, withinLimits(limits)];

    const run = async (
        request: StoreRequest,
        viewer: Viewer,
        now = new Date(0)
    ): Promise<StoreResponse> => {
        let document;
        try {
            document = parse(request.query);
        } catch (error) {
            const message =
                error instanceof GraphQLError ? error.message : 'the query could not be parsed';
            return { errors: [{ message, extensions: { code: 'GRAPHQL_PARSE_FAILED' } }] };
        }
        const problems = validate(schema, document, rules);
        if (problems.length > 0) return { errors: problems.map(shaped) };

        const context: Context = { store, viewer, now };
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
        };
    };

    return { schema, run };
};
