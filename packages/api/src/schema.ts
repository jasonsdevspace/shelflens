import { buildSchema, type GraphQLSchema } from 'graphql';

import { SCHEMA_SOURCE } from './generated/schema-source.js';

/**
 * The schema, built from the copy generated beside the types.
 *
 * `schema.graphql` is the file a reviewer reads. The generated copy is what
 * runs, so the API needs no file system and can run in a service worker.
 */
export const schemaSource = (): string => SCHEMA_SOURCE;

export const buildStoreSchema = (): GraphQLSchema => buildSchema(SCHEMA_SOURCE);
