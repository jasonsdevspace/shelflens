import type { Rule } from '@jasonsdevspace/shelflens';
import { VERSION_HEADER } from '@shelflens/api';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { discardRules, readRules, type RulesBody, saveRules } from '../client/rules.js';
import {
    type Form,
    formOf,
    fresh,
    type Named,
    type Problems,
    problemsOf,
    ruleOf,
    summary,
} from './rule-form.js';
import { RuleForm } from './RuleForm.js';

/**
 * The merchandiser's side of the store: the rules that apply to the
 * current search, one of them open for editing, and a draft the results
 * beside this panel preview before it is saved.
 *
 * The page owns the editor, the form and the loaded set, through the hook
 * below, so the panel can be drawn as a drawer or as a column and drawn
 * anew when the layout changes shape without losing a rule being typed.
 * The draft, the whole set with the edited rule in it, is what the page
 * asks the API to preview in place of the store's rules. Saving posts
 * the same set to the rules path, and the host builds the store again
 * under a new version before it answers, so the next search is the one
 * the preview showed. The store's own rules are one click away, in the
 * panel and on every results page while a saved set is in effect, so the
 * tour never describes a store nobody can get back to.
 */

export interface RulesPanelProps {
    /** The editor's state and actions, held by the page so the panel can be drawn anew without losing them. */
    readonly editor: RulesEditor;
    /** The search the rules are read for. Rules apply to a search, so without one the panel says so. */
    readonly phrase: string | undefined;
    /**
     * The ids of the rules the engine applied to this search, or set aside for
     * its sort, or nothing until the store has answered once.
     */
    readonly applied: readonly string[] | undefined;
    /** The products on the results page, which a rule can name. */
    readonly products: readonly Named[];
    /** The brands on the results page, which a boost or a bury can name. */
    readonly brands: readonly string[];
    /** Whether the results are sorted by relevance, where rules apply. */
    readonly byRelevance: boolean;
    readonly onSortByRelevance: () => void;
}

export interface RulesEditorOptions {
    /** Where the rules are read and saved. */
    readonly rulesUrl: string;
    /** The store was built again, under a new version. Answers the revision that made. */
    readonly onStoreChanged: () => number;
    /** Counts the times the store was built again, by this panel or by the page, so a change made elsewhere is read. */
    readonly storeRevision: number;
    /** Whether the panel is open. Closed, nothing is read, and a rule being typed is let go. */
    readonly enabled: boolean;
}

/** What the panel holds and does, kept by the page across the panel being drawn anew. */
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
    readonly fields: RefObject<HTMLFormElement | null>;
    /** The whole set with the rule being typed in it, once that rule is sound, for the preview. */
    readonly draft: readonly Rule[] | undefined;
    readonly edit: (next: Form, products: readonly Named[]) => void;
    readonly close: () => void;
    readonly save: () => void;
    readonly remove: () => void;
    readonly reset: () => void;
}

const NOT_SAVED = 'The rules could not be saved. Try again.';
const NOT_RESTORED = 'Your rules could not be discarded. Try again.';

interface Loaded extends RulesBody {
    /** The store revision this set is the rules of. Another revision means another set. */
    readonly revision: number;
}

const NOT_READ = 'The rules could not be read. Reload the page and try again.';
const NOT_YET = 'The rules are being read again. Try again in a moment.';

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
    // Each read takes a ticket and only the newest read's answer is kept, so an
    // older answer landing later never overwrites a newer one.
    const ticket = useRef(0);
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
        const mine = ticket.current + 1;
        ticket.current = mine;
        void readRules(rulesUrl).then((next) => {
            if (mine !== ticket.current) return;
            if (next) {
                setLoaded({ ...next, revision: storeRevision });
                // A read that failed at this revision is made good by this one.
                setFailedFor(undefined);
            } else {
                setFailedFor(storeRevision);
            }
        });
        return () => {
            ticket.current += 1;
        };
    }, [rulesUrl, storeRevision, enabled]);
    // The last set read is kept for the form while the next is on its way, but only
    // the set for the store as it is now can be saved over.
    return {
        loaded,
        current: loaded?.revision === storeRevision,
        failed: failedFor === storeRevision,
        accept,
    };
};

const RuleList = ({
    rules,
    applied,
    phrase,
    onPick,
}: {
    readonly rules: readonly Rule[];
    readonly applied: readonly string[] | undefined;
    readonly phrase: string | undefined;
    readonly onPick: (rule: Rule) => void;
}) => {
    const [showAll, setShowAll] = useState(false);
    if (applied === undefined) return null;
    const applying = rules.filter((rule) => applied.includes(rule.id));
    const listed = showAll ? rules : applying;
    return (
        <>
            {!phrase && applying.length === 0 && !showAll && (
                <p className="notice">
                    A rule applies to a search. Search for something to see the rules that apply to
                    it.
                </p>
            )}
            {phrase && applying.length === 0 && !showAll && (
                <p className="notice">No rule applies to &ldquo;{phrase}&rdquo;.</p>
            )}
            {listed.length > 0 && (
                <ul className="rules-list" aria-label={showAll ? 'Every rule' : 'Rules that apply'}>
                    {listed.map((rule) => (
                        <li key={rule.id}>
                            <button
                                type="button"
                                className="option-button rules-rule"
                                onClick={() => onPick(rule)}
                            >
                                <span className="rules-rule-name">{rule.name ?? rule.id}</span>
                                <span className="hint">{summary(rule)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {rules.length > applying.length && (
                <button type="button" className="text-button" onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Show the rules that apply' : 'Show every rule'}
                </button>
            )}
        </>
    );
};

/** Two steps to give up a saved set, since there is no undo for it. */
export const DiscardRules = ({
    rulesUrl,
    onReset,
}: {
    readonly rulesUrl: string;
    /** The host has its own rules back. */
    readonly onReset: () => void;
}) => {
    const [asking, setAsking] = useState(false);
    const [failure, setFailure] = useState<string>();
    const discard = async () => {
        const discarded = await discardRules(rulesUrl);
        const failed = discarded.ok ? undefined : (discarded.reason ?? NOT_RESTORED);
        setFailure(failed);
        setAsking(false);
        if (failed === undefined) onReset();
    };
    if (!asking) {
        return (
            <>
                {failure !== undefined && <span role="alert">{failure} </span>}
                <button type="button" className="text-button" onClick={() => setAsking(true)}>
                    Discard your rules
                </button>
            </>
        );
    }
    return (
        <p className="notice">
            Discard your rules? They cannot be brought back.{' '}
            <button type="button" className="text-button" onClick={() => void discard()}>
                Yes, discard
            </button>{' '}
            <button type="button" className="text-button" onClick={() => setAsking(false)}>
                Keep them
            </button>
        </p>
    );
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
 * panel anew without losing the rule being typed.
 */
export const useRulesEditor = ({
    rulesUrl,
    onStoreChanged,
    storeRevision,
    enabled,
}: RulesEditorOptions): RulesEditor => {
    const { loaded, current, failed, accept } = useLoadedRules(rulesUrl, storeRevision, enabled);
    const [form, setForm] = useState<Form>();
    const [tried, setTried] = useState(false);
    const [message, setMessage] = useState('');
    const [draft, setDraft] = useState<readonly Rule[]>();
    const fields = useRef<HTMLFormElement>(null);
    // A closed panel holds no rule being typed and previews nothing.
    const [wasEnabled, setWasEnabled] = useState(enabled);
    if (wasEnabled !== enabled) {
        setWasEnabled(enabled);
        if (!enabled) {
            setForm(undefined);
            setTried(false);
            setDraft(undefined);
            setMessage('');
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
        // Said only while the panel is open: a save that lands after it closed is not news on the next open.
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

    /** The host has its own rules back. Which those are is the host's to say, so the read follows. */
    const reset = () => {
        changed('The store\u2019s own rules are back.');
    };

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
        fields,
        draft,
        edit,
        close,
        save,
        remove,
        reset,
    };
};

export const RulesPanel = ({
    editor,
    phrase,
    applied,
    products,
    brands,
    byRelevance,
    onSortByRelevance,
}: RulesPanelProps) => {
    const { rulesUrl, rules, edited, editable, failed, form, tried, problems, message, fields } =
        editor;
    const edit = (next: Form) => editor.edit(next, products);
    return (
        <div className="rules">
            <h2 className="rules-title">{phrase ? `Rules for \u201c${phrase}\u201d` : 'Rules'}</h2>
            {!byRelevance && (
                <p className="notice">
                    Sorting sets this search&rsquo;s rules aside.{' '}
                    <button type="button" className="text-button" onClick={onSortByRelevance}>
                        Sort by relevance
                    </button>
                </p>
            )}
            {message && (
                <p className="callout" role="status">
                    {message}
                </p>
            )}
            {failed && (
                <p className="notice" role="alert">
                    {NOT_READ}
                </p>
            )}
            {form ? (
                <RuleForm
                    form={form}
                    problems={problems}
                    tried={tried}
                    products={products}
                    brands={brands}
                    existing={rules.some((rule) => rule.id === form.id)}
                    fields={fields}
                    onChange={edit}
                    onSave={editor.save}
                    onCancel={editor.close}
                    onRemove={editor.remove}
                />
            ) : (
                editable && (
                    <>
                        <RuleList
                            rules={rules}
                            applied={applied}
                            phrase={phrase}
                            onPick={(rule) => edit(formOf(rule))}
                        />
                        <div className="rules-actions">
                            <button
                                type="button"
                                className="text-button"
                                onClick={() => edit(fresh(phrase))}
                            >
                                Add a rule
                            </button>
                        </div>
                        {edited && <DiscardRules rulesUrl={rulesUrl} onReset={editor.reset} />}
                    </>
                )
            )}
        </div>
    );
};
