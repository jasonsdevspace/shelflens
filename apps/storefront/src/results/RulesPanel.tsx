import type { Rule } from '@jasonsdevspace/shelflens';
import { useRef, useState } from 'react';

import { LoadFailure } from '../app/LoadFailure.jsx';
import { ProblemAlert } from '../app/ProblemAlert.jsx';
import { SetApart } from '../app/SetApart.jsx';
import { useStoreInfo } from '../app/StoreContext.jsx';
import { type Form, formOf, fresh, type Named, summary } from './rule-form.js';
import { RuleForm } from './RuleForm.jsx';
import type { Discard } from './useDiscard.js';
import type { RulesEditor } from './useRulesEditor.js';

export interface RulesPanelProps {
    /** The editor the page holds. */
    readonly editor: RulesEditor;
    /**
     * The search the rules are read for. Rules apply to a search, so without
     * one the panel says so.
     */
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
    /** The ids of the rules the sort set aside, each marked so in the list. */
    readonly setAside: readonly string[];
}

// For a developer: the read either never reached the host or came back as something else.
const READ_FAILED = 'the rules path did not answer with a set of rules';

const RuleList = ({
    rules,
    applied,
    setAside,
    phrase,
    onPick,
}: {
    readonly rules: readonly Rule[];
    readonly applied: readonly string[] | undefined;
    readonly setAside: readonly string[];
    readonly phrase: string | undefined;
    readonly onPick: (rule: Rule) => void;
}) => {
    const { locale } = useStoreInfo();
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
                                <span className="hint">{summary(rule, locale)}</span>
                                {setAside.includes(rule.id) && (
                                    <span className="hint">Set aside by this sort</span>
                                )}
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

/** Two steps to give up a saved set, since there is no undo for it, drawn from where it is held. */
export const DiscardRules = ({ held }: { readonly held: Discard }) => {
    if (!held.asking) {
        return (
            <>
                {/* In the kit's words for an error, beside the way to try again rather than in a
                callout of its own, since it can sit in the banner's callout. */}
                {held.failure !== undefined && (
                    <span className="dk-field-error" role="alert">
                        <span className="visually-hidden">Error: </span>
                        {held.failure}{' '}
                    </span>
                )}
                <button type="button" className="text-button" onClick={() => held.ask(true)}>
                    Discard your rules
                </button>
            </>
        );
    }
    return (
        <p className="notice">
            Discard your rules? They cannot be brought back.{' '}
            <button type="button" className="text-button" onClick={() => void held.discard()}>
                Yes, discard
            </button>{' '}
            <button type="button" className="text-button" onClick={() => held.ask(false)}>
                Keep them
            </button>
        </p>
    );
};

/**
 * What the panel says after a change it was asked for. News is said politely. A change that went
 * wrong is said at once, in its own tone, in an alert that is in the panel while a rule is open,
 * before anything is saved, and anew for each failure, so the same words a second time are heard
 * again.
 */
const SaveLines = ({
    message,
    open,
}: {
    readonly message: RulesEditor['message'];
    /** Whether a rule is open, which is when a save can go wrong. */
    readonly open: boolean;
}) => (
    <>
        {message && !message.failed && <SetApart live="status">{message.text}</SetApart>}
        {open && (
            <ProblemAlert
                key={message?.failed === true ? message.at : 0}
                problem={message?.failed === true ? message.text : undefined}
            />
        )}
    </>
);

/**
 * The merchandiser's side of the store: the rules that apply to the current
 * search, one of them open for editing, and a draft the results beside this
 * panel preview before it is saved.
 *
 * The page holds the editor, through `useRulesEditor`. The draft, the whole set
 * with the edited rule in it, is what the page asks the API to preview in
 * place of the store's rules. Saving posts the same set to the rules path,
 * and the host builds the store again under a new version before it answers,
 * so the next search is the one the preview showed. The store's own rules are
 * two presses away, in the panel and on every results page while a saved set
 * is in effect, so the tour never describes a store nobody can get back to.
 */
export const RulesPanel = ({
    editor,
    phrase,
    applied,
    products,
    brands,
    setAside,
}: RulesPanelProps) => {
    const { rules, edited, editable, failed, form, tried, problems, message, fields } = editor;
    const edit = (next: Form) => editor.edit(next, products);
    const title = useRef<HTMLHeadingElement>(null);
    return (
        <div className="rules">
            {/* Takes focus from Try again, which goes while the rules are read. */}
            <h2 className="rules-title" tabIndex={-1} ref={title}>
                {phrase ? `Rules for \u201c${phrase}\u201d` : 'Rules'}
            </h2>
            <SaveLines message={message} open={form !== undefined} />
            {failed && (
                <LoadFailure
                    what="The rules"
                    reason={READ_FAILED}
                    onRetry={() => {
                        title.current?.focus();
                        editor.retry();
                    }}
                />
            )}
            {!failed && !editable && !form && <p className="notice">Reading the rules.</p>}
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
                            setAside={setAside}
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
                        {edited && <DiscardRules held={editor.discarding} />}
                    </>
                )
            )}
        </div>
    );
};
