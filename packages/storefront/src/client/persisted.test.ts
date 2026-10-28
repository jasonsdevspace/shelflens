// @vitest-environment node
import { PERSISTED_OPERATIONS } from '@shelflens/api';
import { stripIgnoredCharacters } from 'graphql';
import { describe, expect, it } from 'vitest';

import * as operations from '../generated/operations.js';

/*
 * Every operation the page can send is one the API knows by name, and the
 * name stands for exactly the text the page would have sent.
 */

const documents = Object.entries(operations).filter(
    (entry): entry is [string, operations.TypedDocumentString<unknown, unknown>] =>
        entry[0].endsWith('Document')
);

describe('the persisted operations', () => {
    it('name every document the page has, by the hash of its text', () => {
        expect(documents.length).toBeGreaterThan(0);
        for (const [name, document] of documents) {
            const hash: unknown = document.__meta__?.hash;
            expect(typeof hash, name).toBe('string');
            expect(PERSISTED_OPERATIONS[hash as string], name).toBe(
                stripIgnoredCharacters(document.toString())
            );
        }
        expect(Object.keys(PERSISTED_OPERATIONS)).toHaveLength(documents.length);
    });
});
