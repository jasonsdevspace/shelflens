import type { Rule } from '@jasonsdevspace/shelflens';
import { isList, isRecord } from '@shelflens/api';

import { reasonOf } from './reason.js';

/**
 * The host's rules path: the set it holds, a set to save in its place, and
 * a request to go back to the store's own.
 *
 * Each answer says whether it worked, with the host's reason when it gave
 * one, so the panel says what to do next in its own words.
 */

/** The set the host holds, and whether a merchandiser has edited it. */
export interface RulesBody {
    readonly rules: readonly Rule[];
    readonly edited: boolean;
}

/** What came of a change: done, with the host's answer, or not, with its reason when it gave one. */
export type Sent =
    | { readonly ok: true; readonly response: Response }
    | { readonly ok: false; readonly reason: string | undefined };

/**
 * A rule is taken on its id, since the host read each rule through its own check when it was
 * saved.
 */
const isRule = (rule: unknown): boolean => isRecord(rule) && typeof rule['id'] === 'string';

/** Whether a body is what the rules path answers, so a stray page with a 200 is not taken for one. */
const isRulesBody = (body: unknown): body is RulesBody =>
    isRecord(body) &&
    isList(body['rules']) &&
    body['rules'].every(isRule) &&
    typeof body['edited'] === 'boolean';

/**
 * The rules path, asked once. Nothing comes back when the request itself
 * could not be made, or was abandoned.
 */
const ask = async (url: string, init?: RequestInit): Promise<Response | undefined> => {
    try {
        return await fetch(url, init);
    } catch {
        return undefined;
    }
};

const sent = async (response: Response | undefined): Promise<Sent> => {
    if (!response) return { ok: false, reason: undefined };
    return response.ok ? { ok: true, response } : { ok: false, reason: await reasonOf(response) };
};

/** The set the host holds, or nothing when it could not be read. */
export const readRules = async (
    rulesUrl: string,
    signal?: AbortSignal
): Promise<RulesBody | undefined> => {
    const response = await ask(rulesUrl, signal && { signal });
    if (!response?.ok) return undefined;
    try {
        const body: unknown = await response.json();
        return isRulesBody(body) ? body : undefined;
    } catch {
        return undefined;
    }
};

/** Saves a set in place of the one the host holds. */
export const saveRules = async (rulesUrl: string, rules: readonly Rule[]): Promise<Sent> =>
    sent(await ask(rulesUrl, { method: 'POST', body: JSON.stringify({ rules }) }));

/** Asks the host for its own rules back. */
export const discardRules = async (rulesUrl: string): Promise<Sent> =>
    sent(await ask(rulesUrl, { method: 'DELETE' }));
