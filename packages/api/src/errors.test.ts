import { describe, expect, it } from 'vitest';

import { errorBody } from './errors.js';

/*
 * The codes a client reads, written out here rather than through the table
 * they come from, so a change to what a status is called is a change to this
 * test too, and never a quiet change to what every host sends.
 */

describe('the one error shape', () => {
    it('names each refusal and failure by its status', () => {
        const codes = [400, 403, 404, 405, 409, 413, 429, 500, 503].map(
            (status) => errorBody(status, 'x').errors[0]?.extensions?.['code']
        );
        expect(codes).toEqual([
            'BAD_REQUEST',
            'FORBIDDEN',
            'NOT_FOUND',
            'METHOD_NOT_ALLOWED',
            'CONFLICT',
            'PAYLOAD_TOO_LARGE',
            'TOO_MANY_REQUESTS',
            'INTERNAL',
            'NOT_READY',
        ]);
    });

    it('takes a more exact code, and more to say, where a refusal has them', () => {
        expect(errorBody(409, 'kept', { code: 'SAVED_RULES', requestId: 'r' })).toEqual({
            errors: [{ message: 'kept', extensions: { code: 'SAVED_RULES', requestId: 'r' } }],
        });
    });
});
