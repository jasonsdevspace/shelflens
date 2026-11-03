import { paysLess } from '@shelflens/api';
import type { Catalog, Product } from '@shelflens/catalog';
import { useId, useState } from 'react';

import { LiveStatus } from '../app/LiveStatus.jsx';
import { count } from '../format/count.js';
import { DEFAULT_LOCALE, formatMoney, formatPriceRange } from '../format/money.js';
import type { Table } from './csv.js';
import type { MappedField, Mapping } from './mapping.js';

/**
 * The visitor's say over the guess: which column feeds each part of a
 * product, which others are searched as words, and three products as the
 * store will show them, so a wrong guess is seen and put right before the
 * store is built.
 */

const FIELD_LABELS: Readonly<Record<MappedField, string>> = {
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

/** The longest a sample value runs in an option before it is cut. */
const SAMPLE_CHARACTERS = 24;

/** The first two different values a column holds, cut short, so an option says what it is. */
export const samplesOf = (table: Table, header: string): string => {
    const index = table.headers.indexOf(header);
    const seen = new Set<string>();
    for (const row of table.rows) {
        const value = (row[index] ?? '').trim();
        if (value === '' || seen.has(value)) continue;
        seen.add(value);
        if (seen.size === 2) break;
    }
    return [...seen]
        .map((value) =>
            value.length > SAMPLE_CHARACTERS
                ? `${value.slice(0, SAMPLE_CHARACTERS - 1)}\u2026`
                : value
        )
        .join(' and ');
};

/** What an option says: the column, the part it feeds now when that is another, and what it holds. */
const optionText = (header: string, usedFor: MappedField | undefined, samples: string): string =>
    [header, usedFor && usedText(header, usedFor), samples && `like ${samples}`]
        .filter((part) => typeof part === 'string' && part !== '')
        .join(', ');

/** The part a column feeds, or only that it is taken when the column bears the part's own name. */
const usedText = (header: string, usedFor: MappedField): string =>
    header.trim().toLowerCase() === FIELD_LABELS[usedFor].toLowerCase()
        ? 'already used'
        : `used for ${FIELD_LABELS[usedFor]}`;

/** A column that went from one part to another, so the part it left can say where it went. */
interface Moved {
    readonly from: MappedField;
    readonly to: MappedField;
    readonly header: string;
}

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
    const [moved, setMoved] = useState<Moved | undefined>(undefined);
    const usedFor = (header: string, field: MappedField): MappedField | undefined =>
        FIELDS.find((other) => other !== field && mapping[other] === header);
    const choose = (field: MappedField, header: string) => {
        const from = header === '' ? undefined : usedFor(header, field);
        setMoved(from ? { from, to: field, header } : undefined);
        onChange(withField(mapping, field, header));
    };
    const describedBy = (field: MappedField) =>
        [
            REQUIRED.has(field) ? `${id}-${field}-needed` : '',
            moved?.from === field ? `${id}-${field}-moved` : '',
        ]
            .filter((part) => part !== '')
            .join(' ') || undefined;
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
                    <div
                        key={field}
                        className={REQUIRED.has(field) ? 'try-field is-needed' : 'try-field'}
                    >
                        <span className="try-field-label">
                            <label htmlFor={`${id}-${field}`}>{FIELD_LABELS[field]}</label>
                            {REQUIRED.has(field) && (
                                <span id={`${id}-${field}-needed`} className="hint">
                                    Needed
                                </span>
                            )}
                        </span>
                        <select
                            className="select"
                            id={`${id}-${field}`}
                            aria-required={REQUIRED.has(field) ? true : undefined}
                            aria-describedby={describedBy(field)}
                            value={mapping[field] ?? ''}
                            onChange={(event) => choose(field, event.target.value)}
                        >
                            <option value="">
                                {REQUIRED.has(field) ? 'Choose a column' : 'Not used'}
                            </option>
                            {table.headers.map((header) => (
                                <option key={header} value={header}>
                                    {optionText(
                                        header,
                                        usedFor(header, field),
                                        samplesOf(table, header)
                                    )}
                                </option>
                            ))}
                        </select>
                        {moved?.from === field && (
                            <span id={`${id}-${field}-moved`} className="hint">
                                Its column, {moved.header}, went to {FIELD_LABELS[moved.to]}.
                            </span>
                        )}
                    </div>
                ))}
            </div>
            <LiveStatus
                text={
                    moved
                        ? `${FIELD_LABELS[moved.from]} no longer has a column, since ${moved.header} went to ${FIELD_LABELS[moved.to]}.`
                        : ''
                }
            />
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
            {product.description !== '' && (
                <span className="notice">{excerpt(product.description)}</span>
            )}
            {product.rating.count > 0 && (
                <span className="notice">
                    {product.rating.average.toFixed(1)} out of 5, from{' '}
                    {count(product.rating.count, 'rating', 'ratings', DEFAULT_LOCALE)}
                </span>
            )}
            <span className="notice">ID {product.sku}</span>
        </li>
    );
};

/** The longest a description runs in the preview before it is cut. */
const EXCERPT_CHARACTERS = 90;

const excerpt = (text: string): string =>
    text.length > EXCERPT_CHARACTERS
        ? `${text.slice(0, EXCERPT_CHARACTERS - 1).trimEnd()}\u2026`
        : text;

const WORDS = ['', 'one', 'two', 'three'];

/**
 * The first three products, as the store will show them. Once the visitor
 * has changed the mapping, each new preview is said, so a change is heard
 * as well as seen.
 */
export const Preview = ({
    catalog,
    changed = false,
}: {
    readonly catalog: Catalog;
    readonly changed?: boolean;
}) => {
    const categories = categoryNamesOf(catalog);
    const shown = catalog.products.slice(0, 3);
    const [first] = shown;
    return (
        <>
            <LiveStatus
                text={
                    changed && first
                        ? `Preview updated. The first product is ${first.name}, ${formatMoney({ amount: first.price.guest.min, currency: catalog.currency })}.`
                        : ''
                }
            />
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
