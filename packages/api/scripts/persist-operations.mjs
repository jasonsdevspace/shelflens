/**
 * Names each of the storefront's operations by the hash of its text, so a
 * client can send the name instead of the query.
 *
 * Runs after the operations are generated. Each generated document gets
 * its hash as metadata, and the API gets a manifest from hash to document,
 * which is the only form of query the public demo accepts. The hash is of
 * the document with GraphQL's insignificant characters removed, so the
 * same operation spelled differently has the same name.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripIgnoredCharacters } from 'graphql';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const operationsPath = join(root, 'packages', 'storefront', 'src', 'generated', 'operations.ts');
const manifestPath = join(root, 'packages', 'api', 'src', 'generated', 'persisted.ts');

const source = readFileSync(operationsPath, 'utf8');
const manifest = new Map();
// A fragment is generated as a document too, but only an operation can be
// sent, so only operations are named. Their text carries the fragments.
const named = source.replace(
    /(export const \w+Document = new TypedDocumentString\()`([^`]*)`(?:, \{[^}]*\})?\)/g,
    (_, head, text) => {
        const document = stripIgnoredCharacters(text);
        const hash = createHash('sha256').update(document).digest('hex');
        manifest.set(hash, document);
        return `${head}\`${text}\`, { hash: '${hash}' })`;
    }
);

const expected = (source.match(/^export const \w+Document = /gm) ?? []).length;
if (manifest.size !== expected) {
    throw new Error(`expected ${expected} operations to be named, named ${manifest.size}`);
}

writeFileSync(operationsPath, named);
writeFileSync(
    manifestPath,
    [
        '// Generated from the storefront operations by scripts/persist-operations.mjs. Edit the operations, not this.',
        'export const PERSISTED_OPERATIONS: Readonly<Record<string, string>> = {',
        ...[...manifest.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([hash, document]) => `    ${JSON.stringify(hash)}: ${JSON.stringify(document)},`),
        '};',
        '',
    ].join('\n')
);
