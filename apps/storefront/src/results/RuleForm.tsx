import { Button, InputField, SelectField } from '@jasonsdevspace/design-kit/react';
import { type FormEvent, type RefObject, useId } from 'react';

import {
    ACTIONS,
    type Form,
    isTarget,
    keptLine,
    type Named,
    namesProducts,
    type Problems,
    STEPS,
    type Target,
    TARGETS,
} from './rule-form.js';
import { onlyUnderRelevance } from './setAside.js';

/** How the form names each target, so a target added to the list needs a name to compile. */
const TARGET_LABELS: Readonly<Record<Target, string>> = { product: 'A product', brand: 'A brand' };

/**
 * One rule, as a form of the design kit's fields. Every change goes up at
 * once, so the results beside the panel preview the draft while it is
 * typed. A problem is said above its field, under the field's hint, which
 * stays, and only once the merchandiser has tried to save, so a half typed
 * rule is not told off.
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

/** A field's problem, once a save was tried. */
const shown = (tried: boolean, problem: string | undefined): string | undefined =>
    tried ? problem : undefined;

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
            // The name of the product the field holds is below it, rather than the kit's hint
            // above it, so the field never moves as a SKU is typed.
            <div key={index} className="rules-product">
                <InputField
                    id={`${id}-sku-${index}`}
                    label={index === 0 ? 'Product' : 'Another product'}
                    error={problems.skuAt === index ? shown(tried, problems.skus) : undefined}
                    list={`${id}-products`}
                    value={sku}
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
                <span id={`${id}-sku-${index}-line`} className="hint">
                    {nameOf([...products, ...form.seen], sku)}
                </span>
            </div>
        ))}
        <datalist id={`${id}-products`}>
            {products.map((product) => (
                <option key={product.sku} value={product.sku}>
                    {product.name}
                </option>
            ))}
        </datalist>
        <span id={`${id}-skus`} className="hint">
            A product the results have shown, or one a saved rule names
        </span>
        {(form.action === 'pin' || form.action === 'hide') && (
            <button
                type="button"
                className="text-button"
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
    <SelectField
        id={`${id}-brand`}
        label="Brand"
        error={shown(tried, problems.brand)}
        value={form.brand}
        onChange={(event) => onChange({ ...form, brand: event.target.value })}
    >
        <option value="">Choose a brand</option>
        {brands.map((brand) => (
            <option key={brand} value={brand}>
                {brand}
            </option>
        ))}
    </SelectField>
);

const WeightField = ({
    id,
    form,
    onChange,
}: Pick<RuleFormProps, 'form' | 'onChange'> & { readonly id: string }) => {
    if (form.action !== 'boost' && form.action !== 'bury') return null;
    return (
        <SelectField
            id={`${id}-step`}
            label="How much"
            hint={onlyUnderRelevance(form.action)}
            value={form.step}
            onChange={(event) => onChange({ ...form, step: Number(event.target.value) })}
        >
            {STEPS[form.action].map((step, index) => (
                <option key={step.label} value={index}>
                    {step.label}
                </option>
            ))}
        </SelectField>
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
            <InputField
                id={`${id}-name`}
                label="Name"
                hint={`Under each card it appears as rule ${form.id}`}
                value={form.name}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
            />
            <InputField
                id={`${id}-words`}
                label="Search words"
                hint="Separate alternatives with commas, like jacket, jackets"
                error={shown(tried, problems.words)}
                value={form.words}
                onChange={(event) => onChange({ ...form, words: event.target.value })}
            />
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
                            {action.label} <span className="hint">{action.gloss}</span>
                        </span>
                    </label>
                ))}
            </fieldset>
            {adjusts && (
                <SelectField
                    id={`${id}-target`}
                    label="On"
                    value={form.target}
                    onChange={(event) => {
                        const { value } = event.target;
                        if (!isTarget(value)) return;
                        onChange({ ...form, target: value });
                    }}
                >
                    {TARGETS.map((target) => (
                        <option key={target} value={target}>
                            {TARGET_LABELS[target]}
                        </option>
                    ))}
                </SelectField>
            )}
            {namesProducts(form) ? (
                <ProductFields id={id} {...props} />
            ) : (
                <BrandField id={id} {...props} />
            )}
            <WeightField id={id} form={form} onChange={onChange} />
            <div className="rules-actions">
                <Button type="submit" accent>
                    Save rule
                </Button>
                <Button onClick={onCancel}>Cancel</Button>
                {existing && (
                    <button type="button" className="text-button" onClick={onRemove}>
                        Remove rule
                    </button>
                )}
            </div>
        </form>
    );
};
