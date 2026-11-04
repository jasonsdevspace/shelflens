// @vitest-environment node
import { createHash } from 'node:crypto';

import { PERSISTED_OPERATIONS } from '@shelflens/api';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';

import * as operations from '../generated/operations.js';

/*
 * Every operation the page can send is one the API knows by name. The page
 * holds only the name, the hash of the operation's text, and the API holds
 * the text.
 */

const generated = (suffix: string) =>
    Object.entries(operations).flatMap(([name, document]) =>
        name.endsWith(suffix) && document instanceof operations.TypedDocumentString
            ? [[name, document] as const]
            : []
    );

const documents = generated('Document');

describe('the persisted operations', () => {
    it('name every document the page has, by the hash of the text the API holds', () => {
        expect(documents.length).toBeGreaterThan(0);
        for (const [name, document] of documents) {
            const hash: unknown = document.__meta__?.['hash'];
            expect(typeof hash, name).toBe('string');
            const text = PERSISTED_OPERATIONS[String(hash)] ?? '';
            expect(createHash('sha256').update(text).digest('hex'), name).toBe(hash);
            // The text is the operation the export is named for.
            const [definition] = parse(text).definitions;
            expect(definition?.kind === 'OperationDefinition' && definition.name?.value, name).toBe(
                name.replace(/Document$/, '')
            );
        }
        expect(Object.keys(PERSISTED_OPERATIONS)).toHaveLength(documents.length);
    });

    it('leave the text out of the page, which sends only the name', () => {
        for (const [name, document] of [...documents, ...generated('FragmentDoc')]) {
            expect(document.toString(), name).toBe('');
        }
    });
});
