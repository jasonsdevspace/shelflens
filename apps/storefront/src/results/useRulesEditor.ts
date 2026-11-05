import type { Rule } from '@jasonsdevspace/shelflens';
import { VERSION_HEADER } from '@shelflens/api';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { createLatest } from '../client/latest.js';
import { readRules, type RulesBody, saveRules } from '../client/rules.js';
import { type Form, type Named, type Problems, problemsOf, ruleOf } from './rule-form.js';
import { type Discard, useDiscard } from './useDiscard.js';

export interface RulesEditorOptions {
    /** Where the rules are read and saved. */
    readonly rulesUrl: string;
    /**
     * The store was built again, under a new version. Answers with the revision
     * that build made.
     */
    readonly onStoreChanged: () => number;
    /**
     * Counts the times the store was built again, by this panel or by the page,
     * so a change made elsewhere is read.
     */
    readonly storeRevision: number;
    /** Whether the panel is open. Closed, nothing is read, and a rule being typed is let go. */
    readonly enabled: boolean;
}

/** What the panel holds and does. */
export interface RulesEditor {
    /** Where the rules are read and saved. */
    readonly rulesUrl: string;
    readonly rules: readonly Rule[];
    readonly edited: boolean;
    readonly editable: boolean;
    readonly failed: boolean;
    readonly form: Form | undefined;
    readonly tried: boolean;
    readonly problems: Problems;
    readonly message: string;
    /**
     * Giving up the saved set: the step the visitor is on and what the host said if it refused,
     * let go when a rule is taken up, when the store changes and when the panel closes.
     */
    readonly discarding: Discard;
    readonly fields: RefObject<HTMLFormElement | null>;
    /** The whole set with the rule being typed in it, once that rule is sound, for the preview. */
    readonly draft: readonly Rule[] | undefined;
    /** Reads the rules again after a read failed. */
    readonly retry: () => void;
    readonly edit: (next: Form, products: readonly Named[]) => void;
    readonly close: () => void;
    readonly save: () => void;
    readonly remove: () => void;
    readonly reset: () => void;
}

const NOT_SAVED = 'The rules could not be saved. Try again.';
const NOT_READ = 'Nothing was saved. Load the rules again first.';
const NOT_YET = 'The rules are being read again. Try again in a moment.';

interface Loaded extends RulesBody {
    /** The store revision this set is the rules of. Another revision means another set. */
    readonly revision: number;
}

/**
 * The rules the host holds, read once the panel opens and again whenever
 * the store was built anew by something other than this panel's own save:
 * its own reset, or the page's. Until the set for the current revision is
 * read nothing can be edited, since a save posts the whole set and a set
 * built on an older one would post that one back. A set the host has just
 * accepted is the set for the revision that save made, so the read for
 * that one revision is skipped.
 */
const useLoadedRules = (rulesUrl: string, storeRevision: number, enabled: boolean) => {
    const [loaded, setLoaded] = useState<Loaded>();
    const [failedFor, setFailedFor] = useState<number>();
    // The revision this panel's own save made, whose read is skipped, once.
    const own = useRef<number>(undefined);
    // Only the newest read's answer is kept, so an older one landing later never overwrites it.
    const [latest] = useState(createLatest);
    // Counts the times asked again after a failed read.
    const [attempt, setAttempt] = useState(0);
    /** The host accepted this set under this revision, so it is the set. */
    const accept = (rules: readonly Rule[], revision: number) => {
        own.current = revision;
        setLoaded({ rules, edited: true, revision });
    };
    useEffect(() => {
        if (!enabled) return;
        if (storeRevision === own.current) {
            own.current = undefined;
            return;
        }
        void latest
            .run((signal) => readRules(rulesUrl, signal))
            .then((outcome) => {
                if (outcome.stale) return;
                const next = outcome.value;
                if (next) {
                    setLoaded({ ...next, revision: storeRevision });
                    // A read that failed at this revision is made good by this one.
                    setFailedFor(undefined);
                } else {
                    setFailedFor(storeRevision);
                }
            });
        return () => {
            latest.cancel();
        };
    }, [rulesUrl, storeRevision, enabled, attempt, latest]);
    /** Reads the set again, with the failure put away while it is on its way. */
    const retry = () => {
        setFailedFor(undefined);
        setAttempt((n) => n + 1);
    };
    // The last set read is kept for the form while the next is on its way, but only
    // the set for the store as it is now can be saved over.
    return {
        loaded,
        current: loaded?.revision === storeRevision,
        failed: failedFor === storeRevision,
        accept,
        retry,
    };
};

const versionLine = (response: Response, said: string): string => {
    const version = response.headers.get(VERSION_HEADER);
    return version
        ? `${said}. The store is now version ${version.split('+').pop() ?? ''}.`
        : `${said}.`;
};

/** Every product a rule names, which the host has already checked exist. */
const namedBy = (rules: readonly Rule[]): readonly string[] =>
    rules.flatMap((rule) => [
        ...(rule.pin ?? []),
        ...(rule.hide ?? []),
        ...(rule.boost ?? []).flatMap((a) => a.ids ?? []),
        ...(rule.bury ?? []).flatMap((a) => a.ids ?? []),
    ]);

/**
 * The editor behind the panel. It lives in the page rather than in the
 * panel, so the panel can be a drawer on a phone and a column beside the
 * results on a wider screen, and crossing from one to the other draws the
 * panel anew without losing the rule being typed, its problems, its preview,
 * the message after a save, or the step of a discard and the host's refusal.
 */
export const useRulesEditor = ({
    rulesUrl,
    onStoreChanged,
    storeRevision,
    enabled,
}: RulesEditorOptions): RulesEditor => {
    const { loaded, current, failed, accept, retry } = useLoadedRules(
        rulesUrl,
        storeRevision,
        enabled
    );
    const [form, setForm] = useState<Form>();
    const [tried, setTried] = useState(false);
    const [message, setMessage] = useState('');
    const [draft, setDraft] = useState<readonly Rule[]>();
    const fields = useRef<HTMLFormElement>(null);
    // Counts the times the visitor moved on from a discard: took up a rule or closed the panel.
    const [movedOn, setMovedOn] = useState(0);
    // A closed panel holds no rule being typed and previews nothing.
    const [wasEnabled, setWasEnabled] = useState(enabled);
    if (wasEnabled !== enabled) {
        setWasEnabled(enabled);
        if (!enabled) {
            setForm(undefined);
            setTried(false);
            setDraft(undefined);
            setMessage('');
            setMovedOn((n) => n + 1);
        }
    }
    // Whether the panel is open now, for a request that lands after it closed.
    const isOpen = useRef(enabled);
    useEffect(() => {
        isOpen.current = enabled;
    }, [enabled]);

    const rules = loaded?.rules ?? [];
    const editable = loaded !== undefined && current && !failed;
    // A product the rule may name: one the page showed while the rule was open, since
    // a hide or a bury takes it off the preview the moment it is named, or one a saved
    // rule already names, which the host has checked.
    const knownFor = (seen: readonly Named[]) =>
        new Set([...seen.map((product) => product.sku), ...namedBy(rules)]);
    const problems = form ? problemsOf(form, knownFor(form.seen)) : {};
    const valid = form !== undefined && Object.keys(problems).length === 0;

    /** The whole set with the form's rule in it, which is what the preview and the save use. */
    const setWith = (rule: Rule): readonly Rule[] => [
        ...rules.filter((kept) => kept.id !== rule.id),
        rule,
    ];

    const edit = (next: Form, products: readonly Named[]) => {
        const shown = new Set(next.seen.map((product) => product.sku));
        const seen = [...next.seen, ...products.filter((product) => !shown.has(product.sku))];
        const merged = { ...next, seen };
        setForm(merged);
        setMessage('');
        if (!form) setMovedOn((n) => n + 1);
        const sound = Object.keys(problemsOf(merged, knownFor(seen))).length === 0;
        setDraft(sound ? setWith(ruleOf(merged)) : undefined);
    };
    const close = () => {
        setForm(undefined);
        setTried(false);
        setDraft(undefined);
    };

    /** The store is new: the page forgets first, so nothing it shows next is from before. */
    const changed = (said: string): number => {
        const revision = onStoreChanged();
        // Said only while the panel is open: a save that lands after it closed is not news on the
        // next open.
        if (isOpen.current) setMessage(said);
        close();
        return revision;
    };

    const commit = async (set: readonly Rule[], said: string) => {
        // A set built on rules the panel could not read is not one to post.
        if (!editable) {
            setMessage(failed ? NOT_READ : NOT_YET);
            return;
        }
        const saved = await saveRules(rulesUrl, set);
        if (!saved.ok) {
            setMessage(saved.reason ?? NOT_SAVED);
            return;
        }
        // The host has the set, so the panel does too, without reading it back.
        accept(set, changed(versionLine(saved.response, said)));
    };

    // A failed save puts focus on the first field with a problem, once the
    // problems are on the page, which is a render after the attempt.
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (attempt > 0)
            fields.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, [attempt]);

    const save = () => {
        if (!form) return;
        setTried(true);
        if (!valid) {
            setAttempt((n) => n + 1);
            return;
        }
        void commit(setWith(ruleOf(form)), 'Rule saved');
    };

    const remove = () => {
        if (form) {
            void commit(
                rules.filter((kept) => kept.id !== form.id),
                'Rule removed'
            );
        }
    };

    /**
     * The host has its own rules back. Which those are is the host's to say, so
     * the read follows.
     */
    const reset = () => {
        changed('The store\u2019s own rules are back.');
    };

    // Let go when a rule is taken up, the panel closes or the store changes.
    const discarding = useDiscard(
        rulesUrl,
        () => reset(),
        `${String(storeRevision)}:${String(movedOn)}`
    );

    return {
        rulesUrl,
        rules,
        edited: loaded?.edited ?? false,
        editable,
        failed,
        form,
        tried,
        problems,
        message,
        discarding,
        fields,
        draft,
        retry,
        edit,
        close,
        save,
        remove,
        reset,
    };
};
