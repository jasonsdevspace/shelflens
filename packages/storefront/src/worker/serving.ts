import type { Catalog } from '@shelflens/catalog';
import { vi } from 'vitest';

/**
 * A `fetch` that serves the catalog and, when asked for `rules.json`, the
 * rules. For the tests that run the worker's handler over a generated
 * catalog, in the worker's own tests and the page's.
 */

/** The URL a fetch was asked for, as text. */
export const urlOf = (input: RequestInfo | URL): string =>
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

export const serving = (catalog: Catalog, rules: unknown = { rules: [] }) =>
    vi.fn<typeof fetch>().mockImplementation((input) =>
        Promise.resolve(
            new Response(JSON.stringify(urlOf(input) === 'rules.json' ? rules : catalog), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        )
    );
