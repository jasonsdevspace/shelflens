import type { CustomerGroup } from '../client/graphql.js';
import type { Hit } from './ProductCard.jsx';

/**
 * What the viewer switch changed on this page, said once, after a switch.
 * Read from the answer in hand: which prices are member prices and which
 * products are for members only. The app says whether this page is the one
 * the switch happened on, so the line survives opening a product and goes
 * quiet on the next search, which was never seen as the other viewer.
 */
export const ViewerNotice = ({
    group,
    items,
    shown,
}: {
    readonly group: CustomerGroup;
    readonly items: readonly Hit[];
    readonly shown: boolean;
}) => {
    if (!shown || items.length === 0) return null;
    return (
        <p className="results-aside" role="status">
            {group === 'member' ? asMember(items) : AS_GUEST}
        </p>
    );
};

const AS_GUEST =
    'Shopping as a guest: prices are list prices, and products for members only are not shown.';

const asMember = (items: readonly Hit[]): string => {
    const discounted = items.filter((hit) => hit.product.price.memberPrice).length;
    const hidden = items.filter((hit) => hit.product.membersOnly).length;
    const prices =
        discounted === 0
            ? 'every product on this page is at list price'
            : `${discounted} ${discounted === 1 ? 'product' : 'products'} on this page ${discounted === 1 ? 'has' : 'have'} a member price`;
    const products =
        hidden === 0
            ? 'none is for members only'
            : `${hidden} ${hidden === 1 ? 'is' : 'are'} shown to members only`;
    return `Shopping as a member: ${prices}, and ${products}.`;
};
