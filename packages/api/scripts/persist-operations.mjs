/**
 * Names each of the storefront's operations by the hash of its text, so a
 * client can send the name instead of the query.
 *
 * Runs after the operations are generated. Each generated document gets
 * its hash as metadata, and the API gets a manifest from hash to document,
 * which is the only form of query the public demo accepts. The hash is of
 * the document with GraphQL's insignificant characters removed, so the
 * same operation spelled differently has the same name.
 *
 * The page sends only the name, so the generated documents keep the hash
 * and give up their text, and the fragments, which are never sent, give up
 * theirs too. Text the page never sends is text it never downloads. The
 * manifest in the API holds the only copy.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripIgnoredCharacters } from 'graphql';

import { isRunDirectly } from '../../../scripts/repository.mjs';

/** An operation already given its name, with its text gone. */
const EMPTIED = /export const \w+Document = new TypedDocumentString\(''/;

/**
 * The generated operations named by hash, without their text, and the
 * manifest from each hash to its text.
 *
 * @param {string} source the operations as codegen wrote them
 * @returns {{ named: string, manifest: Map<string, string> }}
 */
export const nameOperations = (source) => {
    // A second run sees only names, so there is no text left to name.
    if (EMPTIED.test(source)) {
        throw new Error('the operations have no text to name, run `npm run codegen`');
    }
    /** @type {Map<string, string>} */
    const manifest = new Map();
    // A fragment is generated as a document too, but only an operation can be
    // sent, so only operations are named. Their text carries the fragments.
    const named = source
        .replace(
            /(export const \w+Document = new TypedDocumentString\()`([^`]*)`(?:, \{[^}]*\})?\)/g,
            (_, /** @type {string} */ head, /** @type {string} */ text) => {
                const document = stripIgnoredCharacters(text);
                const hash = createHash('sha256').update(document).digest('hex');
                manifest.set(hash, document);
                return `${head}'', { hash: '${hash}' })`;
            }
        )
        .replace(
            /(export const \w+FragmentDoc = new TypedDocumentString\()`[^`]*`(, \{[^}]*\})?\)/g,
            (_, /** @type {string} */ head, /** @type {string} */ meta = '') => `${head}''${meta})`
        );
    const expected = (source.match(/^export const \w+Document = /gm) ?? []).length;
    if (manifest.size !== expected) {
        throw new Error(`expected ${expected} operations to be named, named ${manifest.size}`);
    }
    return { named, manifest };
};

/**
 * The manifest as the API's generated module.
 *
 * @param {ReadonlyMap<string, string>} manifest
 */
const manifestModule = (manifest) =>
    [
        '// Generated from the storefront operations by scripts/persist-operations.mjs. Edit the operations, not this.',
        'export const PERSISTED_OPERATIONS: Readonly<Record<string, string>> = {',
        ...[...manifest.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([hash, document]) => `    ${JSON.stringify(hash)}: ${JSON.stringify(document)},`),
        '};',
        '',
    ].join('\n');

if (isRunDirectly(import.meta.url)) {
    const here = dirname(fileURLToPath(import.meta.url));
    const root = join(here, '..', '..', '..');
    const operationsPath = join(root, 'apps', 'storefront', 'src', 'generated', 'operations.ts');
    const manifestPath = join(root, 'packages', 'api', 'src', 'generated', 'persisted.ts');
    const { named, manifest } = nameOperations(readFileSync(operationsPath, 'utf8'));
    writeFileSync(operationsPath, named);
    writeFileSync(manifestPath, manifestModule(manifest));
}
