/** One star, drawn in a square of sixteen, from x 1.2 to 14.8. */
const STAR = 'M8 1.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12l-4.2 2.2.8-4.7L1.2 6.2l4.7-.7z';

/** Where the star starts and how wide it is, and how far each next one starts, leaving air between. */
const LEFT = 1.2;
const WIDTH = 13.6;
const STEP = 16;
/** The row from the first star's left tip to the last one's right. */
const ROW = STEP * 4 + WIDTH;

/**
 * How much of the row of five a rating fills, to the tenth of a star, as a
 * share of the row's width. Each star is filled across its own width, from
 * its left tip to its right, and the air between two stars counts as neither.
 */
export const filledShare = (average: number): string => {
    const tenths = Math.round(Math.min(Math.max(average, 0), 5) * 10);
    const whole = Math.floor(tenths / 10);
    const part = (tenths % 10) / 10;
    const reach = whole === 5 ? ROW : whole * STEP + part * WIDTH;
    return `${String(Math.round((reach / ROW) * 1000) / 10)}%`;
};

/** A row of five stars, drawn as one picture from the first one's left tip to the last one's right. */
const Row = ({ solid }: { readonly solid: boolean }) => (
    <svg
        viewBox={`${String(LEFT)} ${String(LEFT - 0.6)} ${String(ROW)} ${String(WIDTH)}`}
        className="stars-row"
        focusable="false"
    >
        {[0, 1, 2, 3, 4].map((index) => (
            <path
                key={index}
                d={STAR}
                transform={`translate(${String(index * STEP)} 0)`}
                className={solid ? 'stars-solid' : 'stars-outline'}
            />
        ))}
    </svg>
);

/**
 * Five stars for a rating, outlined, with solid ones laid over them and cut
 * at the average, so a 3.7 fills seven tenths of the fourth star. Filled and
 * empty differ by shape as well as by color. They are only seen: whatever
 * shows them says the rating in words for a screen reader, once.
 */
export const Stars = ({ average }: { readonly average: number }) => (
    <span className="stars" aria-hidden="true">
        <Row solid={false} />
        <span className="stars-fill" style={{ width: filledShare(average) }}>
            <Row solid />
        </span>
    </span>
);
