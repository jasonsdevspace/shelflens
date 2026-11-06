import { screen, waitFor } from '@testing-library/react';

/*
 * Reaching into what a test found. Each helper hands back the item with the
 * type the test expects, or throws naming what was expected, so a test that
 * fails says what was missing rather than reading a property of nothing.
 */

/** The item at an index, counted from the end when negative. */
export const nth = <T>(items: readonly T[], index: number, what: string): T => {
    const item = items.at(index);
    if (item === undefined) throw new Error(`expected ${what}`);
    return item;
};

/** The value as an element of the given type, such as an event's target. */
export const elementAs = <T extends Element>(
    node: unknown,
    type: abstract new () => T,
    what: string
): T => {
    if (!(node instanceof type)) throw new Error(`expected ${what}`);
    return node;
};

/** The nearest element around this one, itself included, that the selector matches. */
export const enclosing = (element: Element, selector: string, what: string): HTMLElement =>
    elementAs(element.closest(selector), HTMLElement, what);

/** An element's words as a reader hears them, each run of white space one space. */
const wordsOf = (element: Element) => element.textContent.replace(/\s+/g, ' ').trim();

/**
 * The alert on the page once it says this. An alert that is on the page empty, so it is heard as
 * it fills a moment later, is found before it says anything, so finding it is not finding its
 * words. Among several alerts, it is the one that says them.
 */
export const alertSaying = (text: string | RegExp): Promise<HTMLElement> =>
    waitFor(() => {
        const said = screen
            .getAllByRole('alert')
            .find((alert) =>
                typeof text === 'string' ? wordsOf(alert).includes(text) : text.test(wordsOf(alert))
            );
        if (!said) throw new Error(`expected an alert saying ${String(text)}`);
        return said;
    });
