// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { reasonOf } from './reason.js';

const answer = (body: string) => new Response(body, { status: 400 });

describe('the reason a host gives', () => {
    it('is the first error’s message, in the API’s shape', async () => {
        expect(
            await reasonOf(answer(JSON.stringify({ errors: [{ message: 'no such product' }] })))
        ).toBe('no such product');
    });

    it('is nothing when the body is not that shape, has no message, or is not JSON', async () => {
        for (const body of [
            '{"error":"x"}',
            '{"errors":[]}',
            '{"errors":[{"message":""}]}',
            'null',
            '<html>',
        ]) {
            expect(await reasonOf(answer(body)), body).toBeUndefined();
        }
    });
});
