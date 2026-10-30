/** A stylesheet imported as text, the way Vite answers a `?inline` import. */
declare module '*.css?inline' {
    const text: string;
    export default text;
}
