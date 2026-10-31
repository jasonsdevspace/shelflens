import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv.js';
import { guessMapping } from './mapping.js';
import { sampleCsv } from './sample.js';

describe('guessing the mapping', () => {
    it('maps the sample file from its headers alone', () => {
        expect(guessMapping(parseCsv(sampleCsv()))).toEqual({
            id: 'SKU',
            name: 'Product name',
            description: 'Description',
            brand: 'Brand',
            category: 'Category',
            colors: 'Colors',
            sizes: 'Sizes',
            material: 'Material',
            price: 'Price',
            memberPrice: 'Member price',
            rating: 'Rating',
            ratingCount: 'Reviews',
            inStock: 'In stock',
        });
    });

    it.each([
        ['product_title', 'name'],
        ['Item-Name', 'name'],
        ['Manufacturer', 'brand'],
        ['Colour', 'colors'],
        ['Product Type', 'category'],
        ['Sale Price', 'memberPrice'],
        ['qty', 'inStock'],
    ])('reads the header %s as %s', (header, field) => {
        const table = parseCsv(`${header},Price\n3,1.00\n`);
        expect(guessMapping(table)).toMatchObject({ [field]: header });
    });

    it('finds the name, the price and the description from the values when no header says', () => {
        const table = parseCsv(
            'col1,col2,col3\n' +
                'Trail Boot,"A waterproof boot with a grippy sole for long muddy walks in the hills",$120.00\n' +
                'Wool Hat,"A warm knitted hat in soft merino that keeps its shape through a whole winter",$25.00\n'
        );
        expect(guessMapping(table)).toEqual({ name: 'col1', description: 'col2', price: 'col3' });
    });

    it('drops a rating or stock guess whose values do not read', () => {
        const table = parseCsv('name,price,rating,stock\nBoot,1.00,great,lots\n');
        const mapping = guessMapping(table);
        expect(mapping.rating).toBeUndefined();
        expect(mapping.inStock).toBeUndefined();
    });

    it('gives each column to one field at most', () => {
        const table = parseCsv('name,title,price\nBoot,Boot,1.00\n');
        expect(guessMapping(table)).toMatchObject({ name: 'name' });
        expect(
            Object.values(guessMapping(table)).filter((header) => header === 'name')
        ).toHaveLength(1);
    });
});
