import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSchema, type GraphQLSchema } from 'graphql';

/**
 * The schema, as the single file it is written in.
 *
 * Read from disk rather than embedded, so the file a reviewer reads and the
 * file the server runs are the same one. The browser build inlines it at
 * bundle time.
 */
const here = dirname(fileURLToPath(import.meta.url));

export const SCHEMA_PATH = join(here, '..', 'schema.graphql');

export const schemaSource = (): string => readFileSync(SCHEMA_PATH, 'utf8');

export const buildStoreSchema = (): GraphQLSchema => buildSchema(schemaSource());
