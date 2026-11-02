import { paysLess } from '@shelflens/api';
import type { Catalog, Product } from '@shelflens/catalog';
import { useId } from 'react';

import { formatMoney, formatPriceRange } from '../format/money.js';
import type { Table } from './csv.js';
import type { MappedField, Mapping } from './mapping.js';

/**
 * The visitor's say over the guess: which column feeds each part of a
 * product, which others are searched as words, and three products as the
 * store will show them, so a wrong guess is seen and put right before the
 * store is built.
 */

export const FIELD_LABELS: Readonly<Record<MappedField, string>> = {
    name: 'Name',
    price: 'Price',
    description: 'Description',
    brand: 'Brand',
    category: 'Category',
    colors: 'Colors',
    sizes: 'Sizes',
    material: 'Material',
    memberPrice: 'Member price',
    rating: 'Rating',
    ratingCount: 'Number of reviews',
    inStock: 'In stock',
    id: 'Product ID',
};

/** The two parts a store cannot do without. Every other part has a default. */
const REQUIRED = new Set<MappedField>(['name', 'price']);

const FIELDS = Object.keys(FIELD_LABELS) as MappedField[];

/**
 * The mapping with one field changed, or left out when no column is chosen.
 * A column feeds one part at most, as the guess keeps it, so giving it to this
 * part takes it from any other, whose choice then shows Not used.
 */
export const withField = (mapping: Mapping, field: MappedField, header: string): Mapping => {
    const { [field]: _old, ...others } = mapping;
    const rest = Object.fromEntries(
        Object.entries(others).filter(
            ([key, value]) => key === 'searchOnly' || (value as unknown) !== header
        )
    ) as Mapping;
    const searchOnly = (mapping.searchOnly ?? []).filter((column) => column !== header);
    const next: Mapping = header === '' ? rest : { ...rest, [field]: header };
    return searchOnly.length > 0 ? { ...next, searchOnly } : withoutSearchOnly(next);
};

const withoutSearchOnly = (mapping: Mapping): Mapping => {
    const { searchOnly: _none, ...rest } = mapping;
    return rest;
};

/** The mapping with a column added to, or taken from, the ones searched as words. */
export const withSearchOnly = (mapping: Mapping, header: string, on: boolean): Mapping => {
    const current = mapping.searchOnly ?? [];
    const searchOnly = on
        ? [...current.filter((column) => column !== header), header]
        : current.filter((column) => column !== header);
    return searchOnly.length > 0 ? { ...mapping, searchOnly } : withoutSearchOnly(mapping);
};

export const MappingEditor = ({
    table,
    mapping,
    onChange,
}: {
    readonly table: Table;
    readonly mapping: Mapping;
    readonly onChange: (mapping: Mapping) => void;
}) => {
    const id = useId();
    const fed = new Set(
        FIELDS.map((field) => mapping[field]).filter((header) => header !== undefined)
    );
    const others = table.headers.filter((header) => !fed.has(header));
    return (
        <>
            <h2>Where each part of a product comes from</h2>
            <p className="notice">
                These are guesses from your column names and what is in them. Change any that are
                wrong. Only Name and Price need a column. The rest can stay Not used.
            </p>
            <div className="try-mapping">
                {FIELDS.map((field) => (
                    <div key={field} className="try-field">
                        <label htmlFor={`${id}-${field}`}>{FIELD_LABELS[field]}</label>
                        <select
                            id={`${id}-${field}`}
                            value={mapping[field] ?? ''}
                            onChange={(event) =>
                                onChange(withField(mapping, field, event.target.value))
                            }
                        >
                            <option value="">
                                {REQUIRED.has(field) ? 'Choose a column' : 'Not used'}
                            </option>
                            {table.headers.map((header) => (
                                <option key={header} value={header}>
                                    {header}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>
            {others.length > 0 && (
                <fieldset className="try-search-only">
                    <legend>Also search these columns</legend>
                    {others.map((header) => (
                        <label key={header}>
                            <input
                                type="checkbox"
                                checked={(mapping.searchOnly ?? []).includes(header)}
                                onChange={(event) =>
                                    onChange(withSearchOnly(mapping, header, event.target.checked))
                                }
                            />{' '}
                            {header}
                        </label>
                    ))}
                </fieldset>
            )}
        </>
    );
};

const categoryNamesOf = (catalog: Catalog): ReadonlyMap<string, string> =>
    new Map(catalog.categories.map((category) => [category.id, category.name]));

const PreviewCard = ({
    product,
    catalog,
    categories,
}: {
    readonly product: Product;
    readonly catalog: Catalog;
    readonly categories: ReadonlyMap<string, string>;
}) => {
    const [variant] = product.variants;
    const path = product.categoryPath.map((id) => categories.get(id) ?? id).join(' › ');
    const details = [
        ...product.colors.slice(0, 3),
        ...product.sizes.slice(0, 3),
        product.material,
    ].filter((detail) => detail !== '');
    return (
        <li className="try-preview-card">
            <span className="try-preview-name">{product.name}</span>
            <span className="notice">
                {[product.brand, path].filter((part) => part !== '').join(' · ')}
            </span>
            <span>
                {formatMoney({ amount: product.price.guest.min, currency: catalog.currency })}
                {/* By the store's own rule, so the preview and the cards say the same. */}
                {paysLess(product, 'member') &&
                    `, member price ${formatPriceRange(
                        { amount: product.price.member.min, currency: catalog.currency },
                        { amount: product.price.member.max, currency: catalog.currency }
                    )}`}
                {variant?.inStock === false && ', out of stock'}
            </span>
            {details.length > 0 && <span className="notice">{details.join(', ')}</span>}
        </li>
    );
};

const WORDS = ['', 'one', 'two', 'three'];

/** The first three products, as the store will show them. */
export const Preview = ({ catalog }: { readonly catalog: Catalog }) => {
    const categories = categoryNamesOf(catalog);
    const shown = catalog.products.slice(0, 3);
    return (
        <>
            <h2>{`${shown.length === 1 ? 'The first product' : `The first ${WORDS[shown.length] ?? shown.length} products`}, as the store will show them`}</h2>
            <ul className="try-preview" aria-label="Preview">
                {shown.map((product) => (
                    <PreviewCard
                        key={product.sku}
                        product={product}
                        catalog={catalog}
                        categories={categories}
                    />
                ))}
            </ul>
        </>
    );
};
