/**
 * Writes the schema into a TypeScript module, so the API can build its
 * schema without reading a file.
 *
 * The API runs in a service worker as well as in Node, and a worker has no
 * file system. The file a reviewer reads, `schema.graphql`, stays the source,
 * and this copy is regenerated beside the types by `npm run codegen`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'schema.graphql'), 'utf8');

writeFileSync(
    join(here, '..', 'src', 'generated', 'schema-source.ts'),
    `// Generated from schema.graphql by scripts/inline-schema.mjs. Edit the schema, not this.\nexport const SCHEMA_SOURCE = ${JSON.stringify(source)};\n`
);
