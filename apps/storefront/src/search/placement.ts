/**
 * How much more of the list must show above the box before it opens there, about one
 * suggestion's height, so it never covers the page above for a few pixels.
 */
export const GAIN_PX = 48;

/** The room either side of the box, the height the list takes whole, and which way it is open. */
export interface Room {
    readonly below: number;
    readonly above: number;
    readonly needs: number;
    readonly open: 'above' | 'below';
}

/**
 * Whether the list opens above the box. It opens below wherever it fits there, and above where it
 * would not fit below and shows a suggestion or more of itself above. Once above, it stays there
 * while it fits above or the room above is still the larger, so it does not jump from side to side
 * as a shopper types and the list grows and narrows.
 */
export const opensAbove = ({ below, above, needs, open }: Room): boolean => {
    if (open === 'above') return needs <= above || above > below;
    return needs > below && Math.min(needs, above) - below >= GAIN_PX;
};
