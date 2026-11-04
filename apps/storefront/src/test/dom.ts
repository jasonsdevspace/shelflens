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
