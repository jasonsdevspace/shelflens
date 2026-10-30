/** A number with its noun, singular for one: "1 suggestion", "2 suggestions". */
export const count = (n: number, one: string, many: string): string =>
    `${n} ${n === 1 ? one : many}`;
