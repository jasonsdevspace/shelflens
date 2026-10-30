import type { Rule, RuleAdjustment, RuleTrigger } from '@jasonsdevspace/shelflens';

/**
 * What the rules form holds, and how it becomes a rule.
 *
 * The form is a merchandiser's view of one rule: a name, the searches it
 * applies to, what it does, and to what. A rule is the engine's view of the
 * same thing. The two translate both ways here, and the form says in its
 * own words what is wrong with it before a rule is made of it.
 */

export type Action = 'pin' | 'boost' | 'bury' | 'hide';
export type Target = 'product' | 'brand';

export interface Form {
    readonly id: string;
    readonly name: string;
    readonly words: string;
    readonly action: Action;
    readonly target: Target;
    readonly skus: readonly string[];
    readonly brand: string;
    /** Which of the named steps, for a boost or a bury. */
    readonly step: number;
    /** The parts of an existing rule the form does not edit, kept as they are. */
    readonly kept: Kept;
    /** The products the page has shown while this rule was open, which it may still name. */
    readonly seen: readonly Named[];
}

export interface Named {
    readonly sku: string;
    readonly name: string;
}

export interface Kept {
    readonly filter?: RuleTrigger['filter'];
    readonly active?: Rule['active'];
}

export type Problems = Partial<Record<'words' | 'skus' | 'brand', string>>;

/** The weight each named step means, so the label says what the explain line will. */
export const STEPS: Readonly<
    Record<'boost' | 'bury', readonly { readonly label: string; readonly weight: number }[]>
> = {
    boost: [
        { label: 'A little, 1.25×', weight: 1.25 },
        { label: 'More, 1.5×', weight: 1.5 },
        { label: 'A lot, 2×', weight: 2 },
    ],
    bury: [
        { label: 'A little, 0.8×', weight: 0.8 },
        { label: 'More, 0.5×', weight: 0.5 },
        { label: 'A lot, 0.25×', weight: 0.25 },
    ],
};

export const ACTIONS: readonly {
    readonly value: Action;
    readonly label: string;
    readonly gloss: string;
}[] = [
    { value: 'pin', label: 'Pin', gloss: 'Put it first, ahead of everything else.' },
    { value: 'boost', label: 'Boost', gloss: 'Move it up.' },
    { value: 'bury', label: 'Bury', gloss: 'Move it down.' },
    { value: 'hide', label: 'Hide', gloss: 'Leave it out.' },
];

const slug = (text: string): string =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'rule';

/** An id made once from the name, with a short tail so two rules with one name stay apart. */
export const newId = (name: string): string =>
    `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`;

export const fresh = (phrase: string | undefined): Form => ({
    id: newId(phrase ?? 'rule'),
    name: '',
    words: phrase ?? '',
    action: 'pin',
    target: 'product',
    skus: [''],
    brand: '',
    step: 1,
    kept: {},
    seen: [],
});

/** Whether a rule names products or a brand, for the two kinds of adjustment. */
const targetOf = (adjustment: RuleAdjustment | undefined): Target =>
    adjustment?.attribute ? 'brand' : 'product';

const actionOf = (rule: Rule): Action => {
    if (rule.pin) return 'pin';
    if (rule.hide) return 'hide';
    if (rule.boost) return 'boost';
    return 'bury';
};

/** Which named step an adjustment's weight is, or the middle one when it is none of them. */
const stepOf = (action: Action, adjustment: RuleAdjustment | undefined): number => {
    const steps = STEPS[action === 'boost' ? 'boost' : 'bury'];
    const found = steps.findIndex((step) => step.weight === adjustment?.weight);
    return found === -1 ? 1 : found;
};

const productsOf = (rule: Rule, adjustment: RuleAdjustment | undefined): readonly string[] =>
    rule.pin ?? rule.hide ?? adjustment?.ids ?? [''];

/** The form for an existing rule, as far as the form can say it. */
export const formOf = (rule: Rule): Form => {
    const action = actionOf(rule);
    const adjustment = rule.boost?.[0] ?? rule.bury?.[0];
    return {
        id: rule.id,
        name: rule.name ?? '',
        words: (rule.when?.queries ?? []).join(', '),
        action,
        target: targetOf(adjustment),
        skus: productsOf(rule, adjustment),
        brand: adjustment?.attribute?.value ?? '',
        step: stepOf(action, adjustment),
        kept: {
            ...(rule.when?.filter && { filter: rule.when.filter }),
            ...(rule.active && { active: rule.active }),
        },
        seen: [],
    };
};

/** What the form keeps as it is, said in a line, or nothing when there is nothing. */
export const keptLine = (kept: Kept): string | undefined => {
    const parts: string[] = [];
    if (kept.filter)
        parts.push(`only with the ${kept.filter.attribute} "${kept.filter.value}" ticked`);
    if (kept.active?.from && kept.active.to) {
        parts.push(`from ${kept.active.from.slice(0, 10)} to ${kept.active.to.slice(0, 10)}`);
    } else if (kept.active?.from) parts.push(`from ${kept.active.from.slice(0, 10)}`);
    else if (kept.active?.to) parts.push(`until ${kept.active.to.slice(0, 10)}`);
    return parts.length > 0
        ? `This rule also applies ${parts.join(', ')}, which stays as it is.`
        : undefined;
};

export const wordsOf = (form: Form): string[] =>
    form.words
        .split(',')
        .map((word) => word.trim())
        .filter((word) => word.length > 0);

const skusOf = (form: Form): string[] => form.skus.map((sku) => sku.trim()).filter(Boolean);

/** Whether the form names products, as a pin and a hide always do. */
export const namesProducts = (form: Form): boolean =>
    form.action === 'pin' || form.action === 'hide' || form.target === 'product';

/** The rule the form describes, once it describes one. */
export const ruleOf = (form: Form): Rule => {
    const name = form.name.trim() || wordsOf(form).join(', ');
    const base: Rule = {
        id: form.id,
        name,
        when: { queries: wordsOf(form), ...(form.kept.filter && { filter: form.kept.filter }) },
        ...(form.kept.active && { active: form.kept.active }),
    };
    if (form.action === 'pin') return { ...base, pin: skusOf(form) };
    if (form.action === 'hide') return { ...base, hide: skusOf(form) };
    const weight = STEPS[form.action][form.step]?.weight ?? 1;
    const adjustment: RuleAdjustment =
        form.target === 'brand'
            ? { attribute: { name: 'brand', value: form.brand }, weight }
            : { ids: skusOf(form), weight };
    return form.action === 'boost'
        ? { ...base, boost: [adjustment] }
        : { ...base, bury: [adjustment] };
};

/** What is wrong with the form, by field, in the merchandiser's words. */
export const problemsOf = (form: Form, known: ReadonlySet<string>): Problems => {
    const problems: { -readonly [Key in keyof Problems]: Problems[Key] } = {};
    if (wordsOf(form).length === 0) {
        problems.words = 'Say which searches this rule applies to, like jacket, jackets.';
    }
    if (namesProducts(form)) {
        const skus = skusOf(form);
        const unknown = skus.find((sku) => !known.has(sku));
        if (skus.length === 0) problems.skus = 'Name at least one product.';
        else if (unknown) {
            problems.skus = `The results have not shown a product with the SKU ${unknown}. Choose one from the list.`;
        }
    } else if (!form.brand) {
        problems.brand = 'Choose a brand.';
    }
    return problems;
};

const count = (n: number) => `${n} ${n === 1 ? 'product' : 'products'}`;
const named = (adjustment: RuleAdjustment) =>
    adjustment.attribute ? adjustment.attribute.value : count(adjustment.ids?.length ?? 0);

/** What a rule does, in a few words, for the list. */
export const summary = (rule: Rule): string => {
    const parts: string[] = [];
    if (rule.pin) parts.push(`Pins ${count(rule.pin.length)}`);
    if (rule.hide) parts.push(`Hides ${count(rule.hide.length)}`);
    for (const boost of rule.boost ?? []) parts.push(`Boosts ${named(boost)} by ${boost.weight}`);
    for (const bury of rule.bury ?? []) parts.push(`Buries ${named(bury)} by ${bury.weight}`);
    if (rule.active?.from) parts.push(`Active from ${rule.active.from.slice(0, 10)}`);
    return parts.join('. ');
};
