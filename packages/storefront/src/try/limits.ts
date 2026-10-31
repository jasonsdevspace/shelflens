/**
 * How large a catalog a visitor can load.
 *
 * The row cap is the largest size the catalog size benchmark found to answer
 * within the popover's budget on a phone, and a test holds it to that record.
 * The byte cap stops a file before it is read, at a size above what a
 * catalog at the row cap takes as the store's own JSON, which carries every
 * variant and price, so an honest file at the cap always fits beneath it.
 */
export const CATALOG_ROW_CAP = 10_000;
export const CATALOG_FILE_BYTES_CAP = 20 * 1024 * 1024;
