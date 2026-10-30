import { type FormEvent, type ReactNode, type RefObject, useId } from 'react';

import {
    ACTIONS,
    type Form,
    keptLine,
    type Named,
    namesProducts,
    type Problems,
    STEPS,
    type Target,
} from './rule-form.js';

/**
 * One rule, as a form. Every change goes up at once, so the results beside
 * the panel preview the draft while it is typed. A problem is said under
 * its field, and only once the merchandiser has tried to save, so a half
 * typed rule is not told off.
 */

export interface RuleFormProps {
    readonly form: Form;
    readonly problems: Problems;
    /** Whether a save was tried, which is when problems are shown. */
    readonly tried: boolean;
    readonly products: readonly Named[];
    readonly brands: readonly string[];
    /** Whether the rule is one the store already has, which can be removed. */
    readonly existing: boolean;
    readonly fields: RefObject<HTMLFormElement | null>;
    readonly onChange: (next: Form) => void;
    readonly onSave: () => void;
    readonly onCancel: () => void;
    readonly onRemove: () => void;
}

/** The line under a field: its problem once a save was tried, otherwise its hint. */
const under = (tried: boolean, problem: string | undefined, hint: string): string =>
    tried && problem !== undefined ? problem : hint;

/** A labeled control with a line under it. The label names the control, and the line describes it. */
const Field = ({
    id,
    label,
    line,
    children,
}: {
    readonly id: string;
    readonly label: string;
    readonly line?: string;
    readonly children: ReactNode;
}) => (
    <div className="rules-field">
        <label htmlFor={id}>{label}</label>
        {children}
        {line !== undefined && (
            <span id={`${id}-line`} className="facet-count">
                {line}
            </span>
        )}
    </div>
);

/** The name the page or the rule has shown for a SKU, which outlives the product's place on the page. */
const nameOf = (named: readonly Named[], sku: string): string =>
    named.find((product) => product.sku === sku.trim())?.name ?? '';

const ProductFields = ({
    id,
    form,
    problems,
    tried,
    products,
    onChange,
}: Pick<RuleFormProps, 'form' | 'problems' | 'tried' | 'products' | 'onChange'> & {
    readonly id: string;
}) => (
    <>
        {form.skus.map((sku, index) => (
            <Field
                key={index}
                id={`${id}-sku-${index}`}
                label={index === 0 ? 'Product' : 'Another product'}
                line={nameOf([...products, ...form.seen], sku)}
            >
                <input
                    id={`${id}-sku-${index}`}
                    className="rules-input"
                    list={`${id}-products`}
                    value={sku}
                    aria-invalid={tried && problems.skus ? true : undefined}
                    aria-describedby={`${id}-skus ${id}-sku-${index}-line`}
                    onChange={(event) =>
                        onChange({
                            ...form,
                            skus: form.skus.map((kept, i) =>
                                i === index ? event.target.value : kept
                            ),
                        })
                    }
                />
            </Field>
        ))}
        <datalist id={`${id}-products`}>
            {products.map((product) => (
                <option key={product.sku} value={product.sku}>
                    {product.name}
                </option>
            ))}
        </datalist>
        <span id={`${id}-skus`} className="facet-count">
            {under(
                tried,
                problems.skus,
                'A product the results have shown, or one a saved rule names'
            )}
        </span>
        {(form.action === 'pin' || form.action === 'hide') && (
            <button
                type="button"
                className="facet-more"
                onClick={() => onChange({ ...form, skus: [...form.skus, ''] })}
            >
                Add another product
            </button>
        )}
    </>
);

const BrandField = ({
    id,
    form,
    problems,
    tried,
    brands,
    onChange,
}: Pick<RuleFormProps, 'form' | 'problems' | 'tried' | 'brands' | 'onChange'> & {
    readonly id: string;
}) => (
    <Field id={`${id}-brand`} label="Brand" line={under(tried, problems.brand, '')}>
        <select
            id={`${id}-brand`}
            className="sort-select"
            value={form.brand}
            aria-invalid={tried && problems.brand ? true : undefined}
            aria-describedby={`${id}-brand-line`}
            onChange={(event) => onChange({ ...form, brand: event.target.value })}
        >
            <option value="">Choose a brand</option>
            {brands.map((brand) => (
                <option key={brand} value={brand}>
                    {brand}
                </option>
            ))}
        </select>
    </Field>
);

const WeightField = ({
    id,
    form,
    onChange,
}: Pick<RuleFormProps, 'form' | 'onChange'> & { readonly id: string }) => {
    if (form.action !== 'boost' && form.action !== 'bury') return null;
    return (
        <Field id={`${id}-step`} label="How much">
            <select
                id={`${id}-step`}
                className="sort-select"
                value={form.step}
                onChange={(event) => onChange({ ...form, step: Number(event.target.value) })}
            >
                {STEPS[form.action].map((step, index) => (
                    <option key={step.label} value={index}>
                        {step.label}
                    </option>
                ))}
            </select>
        </Field>
    );
};

export const RuleForm = (props: RuleFormProps) => {
    const { form, problems, tried, existing, fields, onChange, onSave, onCancel, onRemove } = props;
    const id = useId();
    const adjusts = form.action === 'boost' || form.action === 'bury';
    const submit = (event: FormEvent) => {
        event.preventDefault();
        onSave();
    };
    return (
        <form ref={fields} className="rules-form" onSubmit={submit}>
            <Field
                id={`${id}-name`}
                label="Name"
                line={`Under each card it appears as rule ${form.id}`}
            >
                <input
                    id={`${id}-name`}
                    className="rules-input"
                    value={form.name}
                    aria-describedby={`${id}-name-line`}
                    onChange={(event) => onChange({ ...form, name: event.target.value })}
                />
            </Field>
            <Field
                id={`${id}-words`}
                label="Search words"
                line={under(
                    tried,
                    problems.words,
                    'Separate alternatives with commas, like jacket, jackets'
                )}
            >
                <input
                    id={`${id}-words`}
                    className="rules-input"
                    value={form.words}
                    aria-invalid={tried && problems.words ? true : undefined}
                    aria-describedby={`${id}-words-line`}
                    onChange={(event) => onChange({ ...form, words: event.target.value })}
                />
            </Field>
            {keptLine(form.kept) !== undefined && <p className="notice">{keptLine(form.kept)}</p>}
            <fieldset className="rules-field">
                <legend>What the rule does</legend>
                {ACTIONS.map((action) => (
                    <label key={action.value} className="rules-choice">
                        <input
                            type="radio"
                            name={`${id}-action`}
                            checked={form.action === action.value}
                            onChange={() => onChange({ ...form, action: action.value, step: 1 })}
                        />
                        <span>
                            {action.label} <span className="facet-count">{action.gloss}</span>
                        </span>
                    </label>
                ))}
            </fieldset>
            {adjusts && (
                <Field id={`${id}-target`} label="On">
                    <select
                        id={`${id}-target`}
                        className="sort-select"
                        value={form.target}
                        onChange={(event) =>
                            onChange({ ...form, target: event.target.value as Target })
                        }
                    >
                        <option value="product">A product</option>
                        <option value="brand">A brand</option>
                    </select>
                </Field>
            )}
            {namesProducts(form) ? (
                <ProductFields id={id} {...props} />
            ) : (
                <BrandField id={id} {...props} />
            )}
            <WeightField id={id} form={form} onChange={onChange} />
            <div className="rules-actions">
                <button type="submit" className="drawer-done rules-save">
                    Save rule
                </button>
                <button type="button" className="tour-step" onClick={onCancel}>
                    Cancel
                </button>
                {existing && (
                    <button type="button" className="facets-clear" onClick={onRemove}>
                        Remove rule
                    </button>
                )}
            </div>
        </form>
    );
};
