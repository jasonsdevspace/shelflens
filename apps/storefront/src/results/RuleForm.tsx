import { Button, ChoiceField, InputField, SelectField } from '@jasonsdevspace/design-kit/react';
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

/** Which products a rule may name, said once, above the first product field. */
const SKU_HINT = 'A product the results have shown, or one a saved rule names';

/*
 * One rule, as a form of the design kit's fields. Every change goes up at
 * once, so the results beside the panel preview the draft while it is
 * typed. A problem is said above its field, after any hint the field has,
 * which stays, and only once the merchandiser has tried to save, so a half
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

/**
 * The name the page or the rule has shown for a SKU, which outlives the product's place on the
 * page.
 */
const nameOf = (named: readonly Named[], sku: string): string =>
    named.find((product) => product.sku === sku.trim())?.name ?? '';

const ProductFields = ({
    id,
    form,
    problems,
    products,
    onChange,
}: Pick<RuleFormProps, 'form' | 'problems' | 'products' | 'onChange'> & {
    readonly id: string;
}) => (
    <>
        {form.skus.map((sku, index) => (
            // The first field's hint says which products a rule may name, and every field after
            // it is described by that hint too. The name of the product a field holds is below
            // it, rather than in a hint above it, so the field never moves as a SKU is typed.
            <div key={index} className="rules-product">
                <InputField
                    id={`${id}-sku-${index}`}
                    label={index === 0 ? 'Product' : 'Another product'}
                    hint={index === 0 ? SKU_HINT : undefined}
                    error={problems.skuAt === index ? problems.skus : undefined}
                    list={`${id}-products`}
                    value={sku}
                    aria-describedby={
                        index === 0
                            ? `${id}-sku-0-line`
                            : `${id}-sku-0-hint ${id}-sku-${index}-line`
                    }
                    onChange={(event) =>
                        onChange({
                            ...form,
                            skus: form.skus.map((kept, i) =>
                                i === index ? event.target.value : kept
                            ),
                        })
                    }
                />
                <span id={`${id}-sku-${index}-line`} className="dk-field-hint">
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
        {(form.action === 'pin' || form.action === 'hide') && (
            <Button text onClick={() => onChange({ ...form, skus: [...form.skus, ''] })}>
                Add another product
            </Button>
        )}
    </>
);

const BrandField = ({
    id,
    form,
    problems,
    brands,
    onChange,
}: Pick<RuleFormProps, 'form' | 'problems' | 'brands' | 'onChange'> & {
    readonly id: string;
}) => (
    <SelectField
        id={`${id}-brand`}
        label="Brand"
        error={problems.brand}
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
    // The problems the form says, which are none until a save is tried.
    const said = tried ? problems : {};
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
                error={said.words}
                value={form.words}
                onChange={(event) => onChange({ ...form, words: event.target.value })}
            />
            {keptLine(form.kept) !== undefined && <p className="notice">{keptLine(form.kept)}</p>}
            <ChoiceField
                id={`${id}-action`}
                label="What the rule does"
                name={`${id}-action`}
                choices={ACTIONS.map((action) => ({
                    value: action.value,
                    label: action.label,
                    hint: action.gloss,
                    checked: form.action === action.value,
                    onChange: () => onChange({ ...form, action: action.value, step: 1 }),
                }))}
            />
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
                <ProductFields id={id} {...props} problems={said} />
            ) : (
                <BrandField id={id} {...props} problems={said} />
            )}
            <WeightField id={id} form={form} onChange={onChange} />
            <div className="rules-actions">
                <Button type="submit" accent>
                    Save rule
                </Button>
                <Button onClick={onCancel}>Cancel</Button>
                {existing && (
                    <Button text onClick={onRemove}>
                        Remove rule
                    </Button>
                )}
            </div>
        </form>
    );
};
