import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv.js';
import { guessMapping, type Mapping } from './mapping.js';
import { MappingEditor, Preview, withField, withSearchOnly } from './MappingEditor.jsx';
import { toCatalog } from './to-catalog.js';

const CSV =
    'Product,List price,Sale,Notes,Maker\nTrail Boot,$100.00,$80.00,waterproof,Acme\nWool Hat,$30.00,$24.00,warm,Acme\nCamp Mug,$12.00,$9.00,enamel,Birch\nRain Shell,$150.00,$120.00,packable,Birch\n';
const TABLE = parseCsv(CSV);

/** The editor and the preview together, as the review shows them. */
const Harness = () => {
    const [mapping, setMapping] = useState<Mapping>(() => guessMapping(TABLE));
    const result = toCatalog(TABLE, mapping, new Date('2026-10-31T00:00:00Z'));
    return (
        <main>
            <MappingEditor table={TABLE} mapping={mapping} onChange={setMapping} />
            {result.ok ? <Preview catalog={result.catalog} /> : <p role="alert">{result.error}</p>}
        </main>
    );
};

const preview = () => within(screen.getByRole('list', { name: 'Preview' }));

describe('changing the mapping', () => {
    it('starts from the guess, with three products as the store will show them', async () => {
        render(<Harness />);
        expect(screen.getByLabelText('Name')).toHaveValue('Product');
        expect(screen.getByLabelText('Price')).toHaveValue('List price');
        expect(screen.getByLabelText('Brand')).toHaveValue('Maker');
        expect(preview().getAllByRole('listitem')).toHaveLength(3);
        expect(preview().getByText('Trail Boot')).toBeInTheDocument();
        expect(preview().getByText('$100')).toBeInTheDocument();
        const audit = await axe.run(document.body, {
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(audit.violations).toEqual([]);
    });

    it('shows the price from another column once it is chosen', async () => {
        render(<Harness />);
        await userEvent.selectOptions(screen.getByLabelText('Price'), 'Sale');
        expect(preview().getByText('$80')).toBeInTheDocument();
        expect(preview().queryByText('$100')).not.toBeInTheDocument();
    });

    it('says the name is needed when no column is chosen for it, and recovers when one is', async () => {
        render(<Harness />);
        await userEvent.selectOptions(screen.getByLabelText('Name'), 'Choose a column');
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Choose the column that holds each product’s name.'
        );
        await userEvent.selectOptions(screen.getByLabelText('Name'), 'Product');
        expect(preview().getByText('Trail Boot')).toBeInTheDocument();
    });

    it('offers the columns nothing uses to be searched as words', async () => {
        render(<Harness />);
        const words = screen.getByRole('group', { name: 'Also search these columns' });
        expect(within(words).getByLabelText('Notes')).not.toBeChecked();
        expect(within(words).queryByLabelText('Product')).not.toBeInTheDocument();
        await userEvent.click(within(words).getByLabelText('Notes'));
        expect(within(words).getByLabelText('Notes')).toBeChecked();
    });
});

describe('the mapping helpers', () => {
    it('sets a field, and leaves it out when no column is chosen', () => {
        expect(withField({ name: 'a' }, 'price', 'b')).toEqual({ name: 'a', price: 'b' });
        expect(withField({ name: 'a', price: 'b' }, 'price', '')).toEqual({ name: 'a' });
    });

    it('takes a column out of the words when it is given to a field', () => {
        expect(withField({ searchOnly: ['b', 'c'] }, 'brand', 'b')).toEqual({
            brand: 'b',
            searchOnly: ['c'],
        });
        expect(withField({ searchOnly: ['b'] }, 'brand', 'b')).toEqual({ brand: 'b' });
    });

    it('adds and takes away a column searched as words, once each', () => {
        expect(withSearchOnly({}, 'a', true)).toEqual({ searchOnly: ['a'] });
        expect(withSearchOnly({ searchOnly: ['a'] }, 'a', true)).toEqual({ searchOnly: ['a'] });
        expect(withSearchOnly({ searchOnly: ['a'] }, 'a', false)).toEqual({});
    });
});
