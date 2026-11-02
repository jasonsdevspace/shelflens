type Compare = (a: number, b: number) => number;

/** Moves the item at `i` up a heap whose top is its worst item, until its parent is worse. */
const siftUp = (heap: number[], i: number, compare: Compare): void => {
    const item = heap[i] ?? 0;
    let at = i;
    while (at > 0) {
        const parent = (at - 1) >> 1;
        const above = heap[parent] ?? 0;
        if (compare(item, above) <= 0) break;
        heap[at] = above;
        at = parent;
    }
    heap[at] = item;
};

/** Moves the item at the top down a heap whose top is its worst item, until both children are better. */
const siftDown = (heap: number[], compare: Compare): void => {
    const item = heap[0] ?? 0;
    let at = 0;
    for (;;) {
        const left = at * 2 + 1;
        const right = left + 1;
        let worst = left;
        if (right < heap.length && compare(heap[right] ?? 0, heap[left] ?? 0) > 0) worst = right;
        if (worst >= heap.length || compare(heap[worst] ?? 0, item) <= 0) break;
        heap[at] = heap[worst] ?? 0;
        at = worst;
    }
    heap[at] = item;
};

/**
 * The first `count` items in order, and only those.
 *
 * A page of twenty from a hundred thousand matches needs the best twenty,
 * not all of them ordered. Below half the items, this keeps the best seen
 * so far in a heap with the worst of them on top, and an item that is not
 * better than that one costs a single comparison. The order is total, as
 * every sort ends on the id, so the result is exactly what sorting
 * everything and slicing would give.
 */
export const firstInOrder = (items: number[], count: number, compare: Compare): number[] => {
    if (count <= 0) return [];
    if (count * 2 >= items.length) return items.sort(compare).slice(0, count);
    const heap: number[] = [];
    for (const item of items) {
        if (heap.length < count) {
            heap.push(item);
            siftUp(heap, heap.length - 1, compare);
        } else if (compare(item, heap[0] ?? 0) < 0) {
            heap[0] = item;
            siftDown(heap, compare);
        }
    }
    return heap.sort(compare);
};
