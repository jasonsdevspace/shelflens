import { keysOf, paysLess } from '@shelflens/api';
import { type Catalog, categoryNames, type Product } from '@shelflens/catalog';
import { useId, useMemo, useState } from 'react';

import { LiveStatus } from '../app/LiveStatus.jsx';
import { formatMoney, formatPriceRange } from '../format/money.js';
import { ratingText } from '../format/rating.js';
import type { Table } from './csv.js';
import type { MappedField, Mapping } from './mapping.js';
import { DEFAULT_BRAND, DEFAULT_CATEGORY } from './to-catalog.js';

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

const FIELDS = keysOf(FIELD_LABELS);

/**
 * The mapping with one field changed, or left out when no column is chosen.
 * A column feeds one part at most, as the guess keeps it, so giving it to this
 * part takes it from any other, whose choice then shows Not used.
 */
export const withField = (mapping: Mapping, field: MappedField, header: string): Mapping => {
    const rest: { -readonly [Field in MappedField]?: string } = {};
    for (const other of FIELDS) {
        const column = mapping[other];
        if (other !== field && column !== undefined && column !== header) rest[other] = column;
    }
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

/** Text cut to so many characters, by character rather than by code unit, so no emoji is split. */
const cut = (text: string, characters: number): string => {
    const all = Array.from(text);
    return all.length > characters
        ? `${all
              .slice(0, characters - 1)
              .join('')
              .trimEnd()}\u2026`
        : text;
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
    return [...seen].map((value) => cut(value, SAMPLE_CHARACTERS)).join(' and ');
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
    /** The new mapping, with what to say of a column it moved from one part to another. */
    readonly onChange: (mapping: Mapping, note?: string) => void;
}) => {
    const id = useId();
    const [moved, setMoved] = useState<Moved | undefined>(undefined);
    // What each column holds depends on the file alone, so it is found once for it.
    const samples = useMemo(
        () => new Map(table.headers.map((header) => [header, samplesOf(table, header)])),
        [table]
    );
    const usedFor = (header: string, field: MappedField): MappedField | undefined =>
        FIELDS.find((other) => other !== field && mapping[other] === header);
    const choose = (field: MappedField, header: string) => {
        const from = header === '' ? undefined : usedFor(header, field);
        setMoved(from ? { from, to: field, header } : undefined);
        // Said with the preview that follows, as one line, so neither cuts the other off.
        onChange(
            withField(mapping, field, header),
            from
                ? `${FIELD_LABELS[from]} no longer has a column, since ${header} went to ${FIELD_LABELS[field]}.`
                : undefined
        );
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
                wrong. Only &ldquo;Name&rdquo; and &ldquo;Price&rdquo; need a column. A part left
                &ldquo;Not used&rdquo; gets a default: the brand &ldquo;{DEFAULT_BRAND}&rdquo;, the
                category &ldquo;{DEFAULT_CATEGORY}&rdquo;, in stock, and members pay the guest
                price.
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
                            className="dk-select"
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
                                        samples.get(header) ?? ''
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
            {others.length > 0 && (
                <fieldset className="try-search-only">
                    <legend>Also search these columns</legend>
                    <p className="hint try-search-only-hint">
                        Words in a ticked column find a product but are not shown on it.
                    </p>
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
                {formatMoney(
                    { amount: product.price.guest.min, currency: catalog.currency },
                    catalog.locale
                )}
                {/* By the store's own rule, so the preview and the cards say the same. */}
                {paysLess(product, 'member') &&
                    `, member price ${formatPriceRange(
                        { amount: product.price.member.min, currency: catalog.currency },
                        { amount: product.price.member.max, currency: catalog.currency },
                        catalog.locale
                    )}`}
                {variant?.inStock === false && ', out of stock'}
            </span>
            {details.length > 0 && <span className="notice">{details.join(', ')}</span>}
            {product.description !== '' && (
                <span className="notice">{excerpt(product.description)}</span>
            )}
            {product.rating.count > 0 && (
                <span className="notice">
                    {ratingText(product.rating.average, product.rating.count, catalog.locale)}
                </span>
            )}
            <span className="notice">ID {product.sku}</span>
        </li>
    );
};

/** Each part of a product its preview card shows. */
const shownOf = (product: Product) => [
    product.name,
    product.brand,
    product.categoryPath,
    product.price,
    product.variants[0]?.inStock,
    product.colors.slice(0, 3),
    product.sizes.slice(0, 3),
    product.material,
    product.description,
    product.rating,
    product.sku,
];

/** The longest a description runs in the preview before it is cut. */
const EXCERPT_CHARACTERS = 90;

const excerpt = (text: string): string => cut(text, EXCERPT_CHARACTERS);

const WORDS = ['', 'one', 'two', 'three'];

/**
 * The first three products, as the store will show them. Each time what
 * they show changes from the first guess, it is said, with any note about
 * a column that moved, as one line. A change that leaves them as they were,
 * such as another column searched as words, says nothing.
 */
export const Preview = ({
    catalog,
    note,
}: {
    readonly catalog: Catalog;
    /** What to say first, of a column the last change moved from one part to another. */
    readonly note?: string | undefined;
}) => {
    const categories = categoryNames(catalog);
    const shown = catalog.products.slice(0, 3);
    const [first] = shown;
    // What the cards show, so a change to any part of them is a change to say, and a change
    // they do not show, such as a column searched as words, is not.
    const shows = JSON.stringify(shown.map(shownOf));
    const [firstShown] = useState(shows);
    const said =
        shows === firstShown || !first
            ? ''
            : [
                  note,
                  `Preview updated. The first product is ${first.name}, ${formatMoney({ amount: first.price.guest.min, currency: catalog.currency }, catalog.locale)}.`,
              ]
                  .filter((line) => line !== undefined)
                  .join(' ');
    return (
        <>
            {/* Made anew for each new preview, so the same words for a new preview are said again. */}
            <LiveStatus key={shows} text={said} />
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
