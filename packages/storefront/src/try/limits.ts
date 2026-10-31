/**
 * How large a catalog a visitor can load.
 *
 * The row cap is the largest size the catalog size benchmark found to answer
 * within the popover's budget on a phone, and a test holds it to that record.
 * The byte cap stops a file before it is read. It is about twice what a
 * catalog at the row cap takes as the store's own compact JSON, which
 * carries every variant and price, so a file at the row cap that is pretty
 * printed or has longer text than the generator writes still fits, and a
 * file far past the row cap is refused without reading it.
 */
export const CATALOG_ROW_CAP = 10_000;
export const CATALOG_FILE_BYTES_CAP = 40 * 1024 * 1024;
