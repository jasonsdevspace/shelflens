/**
 * Generates the server's types from the schema.
 *
 * The schema is the contract, and the types on both sides are generated
 * from it, so a change to one that breaks the other fails the build. The
 * output is committed, and CI checks that it still matches the schema.
 *
 *   npm run codegen
 */
export default {
    schema: 'packages/api/schema.graphql',
    generates: {
        'packages/api/src/generated/schema.ts': {
            plugins: ['typescript', 'typescript-resolvers'],
            config: {
                useTypeImports: true,
                strictScalars: true,
                enumsAsConst: true,
                avoidOptionals: { field: true, inputValue: false, object: true },
                defaultMapper: 'Partial<{T}>',
            },
        },
    },
};
