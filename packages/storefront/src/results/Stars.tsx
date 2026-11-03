/** One star, drawn in a square of sixteen. */
const STAR = 'M8 1.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12l-4.2 2.2.8-4.7L1.2 6.2l4.7-.7z';

/** How much of the row of five a rating fills, to the tenth of a star, as a share of its width. */
export const filledShare = (average: number): string => {
    const tenths = Math.round(Math.min(Math.max(average, 0), 5) * 10);
    return `${String(tenths * 2)}%`;
};

/**
 * Five stars for a rating, outlined, with solid ones laid over them and cut
 * at the average, so a 3.7 fills seven tenths of the fourth star. Filled and
 * empty differ by shape as well as by color. They are only seen: whatever
 * shows them says the rating in words for a screen reader, once.
 */
export const Stars = ({ average }: { readonly average: number }) => {
    const row = (solid: boolean) =>
        [0, 1, 2, 3, 4].map((index) => (
            <svg key={index} viewBox="0 0 16 16" className="stars-star" focusable="false">
                <path d={STAR} className={solid ? 'stars-solid' : 'stars-outline'} />
            </svg>
        ));
    return (
        <span className="stars" aria-hidden="true">
            {row(false)}
            <span className="stars-fill" style={{ width: filledShare(average) }}>
                {row(true)}
            </span>
        </span>
    );
};
