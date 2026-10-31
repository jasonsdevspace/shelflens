import { type Catalog, generateCatalog } from '@shelflens/catalog';

/**
 * The sample file a visitor can download and load, so trying the page takes
 * one click for a reviewer with no catalog to hand.
 *
 * It is the demo's own generator, flattened into the columns a shop's export
 * usually has, with the headers a spreadsheet would give them, so loading it
 * exercises the guessed mapping as a real file would. The build writes it
 * beside the catalog, so it always matches the generator.
 */
export const SAMPLE_PRODUCTS = 200;
export const SAMPLE_PATH = 'try/sample-products.csv';

const HEADERS = [
    'SKU',
    'Product name',
    'Description',
    'Brand',
    'Category',
    'Colors',
    'Sizes',
    'Material',
    'Price',
    'Member price',
    'Rating',
    'Reviews',
    'In stock',
] as const;

/** A field quoted when it holds a comma, a quote or a line break. */
const csvField = (value: string): string =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const categoryNames = (catalog: Catalog): ReadonlyMap<string, string> =>
    new Map(catalog.categories.map((category) => [category.id, category.name]));

export const sampleCsv = (): string => {
    const catalog = generateCatalog({ products: SAMPLE_PRODUCTS });
    const names = categoryNames(catalog);
    const rows = catalog.products.map((product) => [
        product.sku,
        product.name,
        product.description,
        product.brand,
        product.categoryPath.map((id) => names.get(id) ?? id).join(' > '),
        product.colors.join(', '),
        product.sizes.join(', '),
        product.material,
        dollars(product.price.guest.min),
        dollars(product.price.member.min),
        product.rating.count > 0 ? product.rating.average.toFixed(1) : '',
        String(product.rating.count),
        product.variants.some((variant) => variant.inStock) ? 'yes' : 'no',
    ]);
    return [HEADERS, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n';
};
