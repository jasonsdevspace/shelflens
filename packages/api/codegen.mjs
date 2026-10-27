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
                enumsAsTypes: true,
                avoidOptionals: { field: true, inputValue: false, object: true },
                contextType: '../context.js#Context',
                immutableTypes: true,
                mappers: {
                    Product: '@shelflens/catalog#Product as ProductModel',
                    Variant: '@shelflens/catalog#Variant as VariantModel',
                    Brand: '@shelflens/catalog#Brand as BrandModel',
                    Category: '@shelflens/catalog#Category as CategoryModel',
                    SearchHit: '../resolvers.js#HitModel',
                    SearchResult: '../resolvers.js#SearchResultModel',
                    Facet: '@jasonsdevspace/shelflens#Facet as FacetModel',
                    ValueFacet: '@jasonsdevspace/shelflens#Facet as FacetModel',
                    RangeFacet: '@jasonsdevspace/shelflens#Facet as FacetModel',
                    StatsFacet: '@jasonsdevspace/shelflens#Facet as FacetModel',
                },
            },
        },
    },
};
