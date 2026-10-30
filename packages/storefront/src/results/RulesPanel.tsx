import type { Rule } from '@jasonsdevspace/shelflens';
import { VERSION_HEADER } from '@shelflens/api';
import { useEffect, useRef, useState } from 'react';

import { type Form, formOf, fresh, type Named, problemsOf, ruleOf, summary } from './rule-form.js';
import { RuleForm } from './RuleForm.js';

/**
 * The merchandiser's side of the store: the rules that apply to the
 * current search, one of them open for editing, and a draft the results
 * beside this panel preview before it is saved.
 *
 * The panel owns the form and the loaded set. The draft, the whole set
 * with the edited rule in it, goes up to the results page, which asks the
 * API for a preview with it in place of the store's rules. Saving posts
 * the same set to the rules path, and the host builds the store again
 * under a new version before it answers, so the next search is the one
 * the preview showed. The store's own rules are one click away, in the
 * panel and on every results page while a saved set is in effect, so the
 * tour never describes a store nobody can get back to.
 */

export interface RulesPanelProps {
    /** The search the rules are read for. Rules apply to a search, so without one the panel says so. */
    readonly phrase: string | undefined;
    /**
     * The ids of the rules the engine applied to this search, or set aside for
     * its sort, or nothing while the store's own answer is still on its way.
     */
    readonly applied: readonly string[] | undefined;
    /** Where the rules are read and saved. */
    readonly rulesUrl: string;
    /** The products on the results page, which a rule can name. */
    readonly products: readonly Named[];
    /** The brands on the results page, which a boost or a bury can name. */
    readonly brands: readonly string[];
    readonly onDraft: (rules: readonly Rule[] | undefined) => void;
    /** The store was built again, under a new version. */
    readonly onStoreChanged: () => void;
    /** Whether the results are sorted by relevance, where rules apply. */
    readonly byRelevance: boolean;
    readonly onSortByRelevance: () => void;
}

export { STEPS } from './rule-form.js';

const NOT_SAVED = 'The rules could not be saved. Try again.';
export const NOT_RESTORED = 'The store’s rules could not be brought back. Try again.';

interface Loaded {
    readonly rules: readonly Rule[];
    readonly edited: boolean;
}

const read = async (rulesUrl: string): Promise<Loaded | undefined> => {
    try {
        const response = await fetch(rulesUrl);
        return response.ok ? ((await response.json()) as Loaded) : undefined;
    } catch {
        return undefined;
    }
};

/**
 * The rules the host holds, read once the panel opens and again after each
 * change. Until they are read nothing can be edited, since a save posts the
 * whole set and a set built on nothing would wipe the store's rules. A set
 * the host has just accepted is the set, whether or not the read after it
 * answers, so a save never builds on what was there before the last one.
 */
const useLoadedRules = (rulesUrl: string) => {
    const [loaded, setLoaded] = useState<Loaded>();
    const [failed, setFailed] = useState(false);
    const reload = async () => {
        const next = await read(rulesUrl);
        if (next) setLoaded(next);
        setFailed(next === undefined);
    };
    const accept = (rules: readonly Rule[]) => {
        setLoaded({ rules, edited: true });
        setFailed(false);
    };
    useEffect(() => {
        let open = true;
        void read(rulesUrl).then((next) => {
            if (!open) return;
            if (next) setLoaded(next);
            setFailed(next === undefined);
        });
        return () => {
            open = false;
        };
    }, [rulesUrl]);
    return { loaded, failed, reload, accept };
};

/** The draft is the panel's, so it goes with the panel: a closed panel previews nothing. */
const useDraftCleared = (onDraft: RulesPanelProps['onDraft']) => {
    const latest = useRef(onDraft);
    useEffect(() => {
        latest.current = onDraft;
    }, [onDraft]);
    useEffect(() => () => latest.current(undefined), []);
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
                                className="facet-link rules-rule"
                                onClick={() => onPick(rule)}
                            >
                                <span className="rules-rule-name">{rule.name ?? rule.id}</span>
                                <span className="facet-count">{summary(rule)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {rules.length > applying.length && (
                <button type="button" className="facet-more" onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Show the rules that apply' : 'Show every rule'}
                </button>
            )}
        </>
    );
};

/** Two steps to give up a saved set, since there is no undo for it. */
export const DiscardRules = ({ onDiscard }: { readonly onDiscard: () => void }) => {
    const [asking, setAsking] = useState(false);
    if (!asking) {
        return (
            <button type="button" className="facets-clear" onClick={() => setAsking(true)}>
                Use the store&rsquo;s rules
            </button>
        );
    }
    return (
        <p className="notice">
            Discard your rules? They cannot be brought back.{' '}
            <button type="button" className="facets-clear" onClick={onDiscard}>
                Yes, discard
            </button>{' '}
            <button type="button" className="facets-clear" onClick={() => setAsking(false)}>
                Keep them
            </button>
        </p>
    );
};

const failureOf = async (response: Response, otherwise: string): Promise<string> => {
    const body = (await response.json().catch(() => ({}))) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? otherwise;
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

export const RulesPanel = ({
    phrase,
    applied,
    rulesUrl,
    products,
    brands,
    onDraft,
    onStoreChanged,
    byRelevance,
    onSortByRelevance,
}: RulesPanelProps) => {
    const { loaded, failed, reload, accept } = useLoadedRules(rulesUrl);
    useDraftCleared(onDraft);
    const [form, setForm] = useState<Form>();
    const [tried, setTried] = useState(false);
    const [message, setMessage] = useState('');
    const fields = useRef<HTMLFormElement>(null);

    const rules = loaded?.rules ?? [];
    const editable = loaded !== undefined && !failed;
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

    const edit = (next: Form) => {
        const shown = new Set(next.seen.map((product) => product.sku));
        const seen = [...next.seen, ...products.filter((product) => !shown.has(product.sku))];
        const form = { ...next, seen };
        setForm(form);
        setMessage('');
        const sound = Object.keys(problemsOf(form, knownFor(seen))).length === 0;
        onDraft(sound ? setWith(ruleOf(form)) : undefined);
    };
    const close = () => {
        setForm(undefined);
        setTried(false);
        onDraft(undefined);
    };

    /** The store is new: the page forgets first, so nothing it shows next is from before. */
    const changed = async (said: string) => {
        onStoreChanged();
        setMessage(said);
        close();
        await reload();
    };

    const commit = async (set: readonly Rule[], said: string) => {
        if (!editable) return;
        try {
            const response = await fetch(rulesUrl, {
                method: 'POST',
                body: JSON.stringify({ rules: set }),
            });
            if (!response.ok) {
                setMessage(await failureOf(response, NOT_SAVED));
                return;
            }
            accept(set);
            await changed(versionLine(response, said));
        } catch {
            setMessage(NOT_SAVED);
        }
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

    const discard = async () => {
        try {
            const response = await fetch(rulesUrl, { method: 'DELETE' });
            if (!response.ok) {
                setMessage(await failureOf(response, NOT_RESTORED));
                return;
            }
            await changed('The store’s own rules are back.');
        } catch {
            setMessage(NOT_RESTORED);
        }
    };

    return (
        <div className="rules">
            <h2 className="facet-title">{phrase ? `Rules for “${phrase}”` : 'Rules'}</h2>
            {!byRelevance && (
                <p className="notice">
                    Sorting sets this search&rsquo;s rules aside.{' '}
                    <button type="button" className="facets-clear" onClick={onSortByRelevance}>
                        Sort by relevance
                    </button>
                </p>
            )}
            {message && (
                <p className="results-aside" role="status">
                    {message}
                </p>
            )}
            {failed && (
                <p className="notice" role="alert">
                    The rules could not be read. Reload the page and try again.
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
                    onSave={save}
                    onCancel={close}
                    onRemove={remove}
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
                                className="facet-more"
                                onClick={() => edit(fresh(phrase))}
                            >
                                Add a rule
                            </button>
                        </div>
                        {loaded.edited && <DiscardRules onDiscard={() => void discard()} />}
                    </>
                )
            )}
        </div>
    );
};
