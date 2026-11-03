import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv.js';
import { guessMapping, type Mapping } from './mapping.js';
import { MappingEditor, Preview, samplesOf, withField, withSearchOnly } from './MappingEditor.jsx';
import { toCatalog } from './to-catalog.js';

const CSV =
    'Product,List price,Sale,Notes,Maker\nTrail Boot,$100.00,$80.00,waterproof,Acme\nWool Hat,$30.00,$24.00,warm,Acme\nCamp Mug,$12.00,$9.00,enamel,Birch\nRain Shell,$150.00,$120.00,packable,Birch\n';
const TABLE = parseCsv(CSV);

/** The editor and the preview together, as the review shows them. */
const Harness = () => {
    const [mapping, setMapping] = useState<Mapping>(() => guessMapping(TABLE));
    const [note, setNote] = useState<string | undefined>(undefined);
    const result = toCatalog(TABLE, mapping, new Date('2026-10-31T00:00:00Z'));
    return (
        <main>
            <MappingEditor
                table={TABLE}
                mapping={mapping}
                onChange={(next, said) => {
                    setMapping(next);
                    setNote(said);
                }}
            />
            {result.ok ? (
                <Preview catalog={result.catalog} note={note} />
            ) : (
                <p role="alert">{result.error}</p>
            )}
        </main>
    );
};

const preview = () => within(screen.getByRole('list', { name: 'Preview' }));

/** What the page's status regions say, once each has had its moment to fill. */
const said = async (line: string) =>
    waitFor(() =>
        expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain(line)
    );

describe('what each choice says', () => {
    it('shows what a column holds beside its name, and the part it feeds now when that is another', () => {
        render(<Harness />);
        const options = within(screen.getByLabelText('Brand'))
            .getAllByRole('option')
            .map((option) => option.textContent);
        expect(options).toContain('Notes, like waterproof and warm');
        expect(options).toContain('Maker, like Acme and Birch');
        // The column the name comes from is offered to the brand as already taken.
        expect(options).toContain('Product, used for Name, like Trail Boot and Wool Hat');
    });

    it('says only that a column is taken when it bears the name of the part it feeds', () => {
        render(<Harness />);
        const options = within(screen.getByLabelText('Name'))
            .getAllByRole('option')
            .map((option) => option.textContent);
        expect(options).toContain('Maker, used for Brand, like Acme and Birch');
        const table = parseCsv('Name,Price,Brand\nBench,120,Oak & Co\n');
        render(
            <MappingEditor table={table} mapping={guessMapping(table)} onChange={() => undefined} />
        );
        const [, second] = screen.getAllByLabelText('Price');
        expect(
            within(second as HTMLElement)
                .getAllByRole('option')
                .map((option) => option.textContent)
        ).toContain('Brand, already used, like Oak & Co');
    });

    it('cuts a long value short, and leaves out a column with nothing in it', () => {
        const table = parseCsv('name,price,notes\nA very long product name indeed here,1,\nB,2,\n');
        expect(samplesOf(table, 'name')).toBe('A very long product nam\u2026 and B');
        expect(samplesOf(table, 'notes')).toBe('');
    });

    it('says when choosing a column takes it from another part, under that part and aloud', async () => {
        render(<Harness />);
        await userEvent.selectOptions(screen.getByLabelText('Description'), 'Maker');
        expect(screen.getByLabelText('Brand')).toHaveValue('');
        expect(screen.getByLabelText('Brand')).toHaveAccessibleDescription(
            'Its column, Maker, went to Description.'
        );
        // Said with the preview it changed, as one line, so neither cuts the other off.
        await said(
            'Brand no longer has a column, since Maker went to Description. Preview updated. The first product is Trail Boot, $100.'
        );
        expect(
            screen.getAllByRole('status').filter((status) => status.textContent !== '')
        ).toHaveLength(1);
        // The next choice is a new one, so the note goes.
        await userEvent.selectOptions(screen.getByLabelText('Colors'), 'Notes');
        expect(screen.getByLabelText('Brand')).not.toHaveAccessibleDescription();
    });
});

describe('the preview', () => {
    it('shows the parts a guess can get wrong: the description, the rating and the ID', () => {
        const table = parseCsv(
            'name,price,description,stars,reviews,code\nBench,120,Solid oak with a waxed finish,4.5,12,B-1\n'
        );
        const result = toCatalog(table, guessMapping(table), new Date('2026-10-31T00:00:00Z'));
        if (!result.ok) throw new Error(result.error);
        render(<Preview catalog={result.catalog} />);
        expect(preview().getByText('Solid oak with a waxed finish')).toBeInTheDocument();
        expect(preview().getByText('4.5 out of 5, from 12 ratings')).toBeInTheDocument();
        expect(preview().getByText('ID B-1')).toBeInTheDocument();
    });

    it('says a change to any part the cards show, though the first product keeps its name and price', async () => {
        render(<Harness />);
        await userEvent.selectOptions(screen.getByLabelText('Brand'), 'Notes');
        await said('Preview updated. The first product is Trail Boot, $100.');
        const first = screen.getAllByRole('status').find((status) => status.textContent !== '');
        // The same words for another new preview come from a region made anew, so they are said again.
        await userEvent.selectOptions(screen.getByLabelText('Brand'), 'Maker');
        await userEvent.selectOptions(screen.getByLabelText('Colors'), 'Notes');
        await said('Preview updated. The first product is Trail Boot, $100.');
        expect(screen.getAllByRole('status')).not.toContain(first);
    });

    it('says nothing when a change leaves the cards as they were', async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole('checkbox', { name: 'Notes' }));
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(screen.getAllByRole('status').every((status) => status.textContent === '')).toBe(
            true
        );
    });

    it('cuts a long value by character, so an emoji is never split', () => {
        const table = parseCsv('name,price\nUltra comfy trail shoes \u{1F45F} red,1\n');
        expect(samplesOf(table, 'name')).toBe('Ultra comfy trail shoes\u2026');
        // The emoji is the last character kept, where cutting by code unit would split it.
        const emoji = parseCsv('name,price\nUltra comfy trail shoe\u{1F45F}\u{1F45F} red,1\n');
        expect(Array.from(samplesOf(emoji, 'name')).every((char) => char !== '\uFFFD')).toBe(true);
        expect(samplesOf(emoji, 'name')).toBe('Ultra comfy trail shoe\u{1F45F}\u2026');
    });

    it('says nothing of the first guess, and says each preview once the guess is changed', async () => {
        render(<Harness />);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(screen.getAllByRole('status').every((status) => status.textContent === '')).toBe(
            true
        );
        await userEvent.selectOptions(screen.getByLabelText('Price'), 'Sale');
        await said('Preview updated. The first product is Trail Boot, $80.');
    });
});

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

    it('names how many products it shows when there are fewer than three', () => {
        const two = toCatalog(parseCsv('name,price\nBoot,$1.00\nHat,$2.00\n'), {
            name: 'name',
            price: 'price',
        });
        if (!two.ok) throw new Error(two.error);
        render(<Preview catalog={two.catalog} />);
        expect(
            screen.getByRole('heading', {
                name: 'The first two products, as the store will show them',
            })
        ).toBeInTheDocument();
    });

    it('offers the columns nothing uses to be searched as words, none of them ticked at first', async () => {
        render(<Harness />);
        const all = within(
            screen.getByRole('group', { name: 'Also search these columns' })
        ).getAllByRole('checkbox');
        expect(all.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
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

    it('gives a column to one part at most, taking it from the part that had it', () => {
        expect(withField({ name: 'a', brand: 'b' }, 'brand', 'a')).toEqual({ brand: 'a' });
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

describe('the preview', () => {
    it('names a member price where members pay less only at the top of a range, as the store does', () => {
        const result = toCatalog(TABLE, guessMapping(TABLE), new Date('2026-10-31T00:00:00Z'));
        if (!result.ok) throw new Error(result.error);
        const [first, ...rest] = result.catalog.products;
        if (!first) throw new Error('expected a product');
        const ranged = {
            ...first,
            price: { guest: { min: 5000, max: 6000 }, member: { min: 5000, max: 5500 } },
        };
        render(<Preview catalog={{ ...result.catalog, products: [ranged, ...rest] }} />);
        expect(preview().getAllByRole('listitem')[0]).toHaveTextContent('member price $50 to $55');
    });
});
