import { Callout } from '@jasonsdevspace/design-kit/react';
import { useEffect, useEffectEvent, useState } from 'react';

import { StatusRegion } from '../app/LiveStatus.jsx';
import { useStoreInfo } from '../app/StoreContext.jsx';
import type { CustomerGroup } from '../client/graphql.js';
import { count } from '../format/count.js';
import type { Hit } from './ProductCard.jsx';

/**
 * What the viewer switch changed on this page, shown after a switch and
 * said once. Read from the answer in hand: which prices are member prices
 * and which products are for members only. The app says whether this page
 * is the one the switch happened on, so the line survives opening a
 * product and goes quiet on the next search, which was never seen as the
 * other viewer.
 *
 * The line on the page stays through a load for the same viewer, so it
 * never flickers, and waits through the load a switch starts, since the
 * answer in hand is still the other viewer's. What a screen reader hears
 * is a separate live region, mounted empty and filled once the first
 * answer after the switch lands, so the switch is heard once rather than
 * again on every sort, page or return after it.
 */
export const ViewerNotice = ({
    group,
    items,
    shown,
    answered,
    heard,
    onHeard,
}: {
    readonly group: CustomerGroup;
    readonly items: readonly Hit[];
    readonly shown: boolean;
    /** Whether the items are the answer to the current request. */
    readonly answered: boolean;
    /** Whether this switch has been said already. */
    readonly heard: boolean;
    readonly onHeard: () => void;
}) => {
    const { locale } = useStoreInfo();
    // The line as the last answer for this viewer put it, kept while the next one loads.
    const fresh = answered && shown && items.length > 0 ? sentence(group, items, locale) : '';
    const [kept, setKept] = useState({ group, text: fresh });
    if (answered && (kept.group !== group || kept.text !== fresh)) setKept({ group, text: fresh });
    const text = shown && kept.group === group ? kept.text : '';
    const [said, setSaid] = useState('');
    // Once the page moves on, the line said is not left for a screen reader to find twice.
    if (said !== '' && said !== text) setSaid('');
    const hear = useEffectEvent(onHeard);
    useEffect(() => {
        if (heard || !answered) return;
        // An answer with nothing to say still ends the switch, so it is never said late.
        if (fresh === '') {
            hear();
            return;
        }
        const timer = setTimeout(() => {
            setSaid(fresh);
            hear();
        }, 0);
        return () => clearTimeout(timer);
    }, [heard, answered, fresh]);
    return (
        <>
            <StatusRegion>{said}</StatusRegion>
            {text !== '' && (
                <div className="callout">
                    <Callout>{text}</Callout>
                </div>
            )}
        </>
    );
};

const sentence = (group: CustomerGroup, items: readonly Hit[], locale: string): string =>
    group === 'member' ? asMember(items, locale) : AS_GUEST;

const AS_GUEST =
    'Shopping as a guest: prices are list prices, and products for members only are hidden. Choose "Member" under "Shopping as" to see them.';

const asMember = (items: readonly Hit[], locale: string): string => {
    const discounted = items.filter((hit) => hit.product.price.memberPrice).length;
    const hidden = items.filter((hit) => hit.product.membersOnly).length;
    const prices =
        discounted === 0
            ? 'every product on this page is at list price'
            : `${count(discounted, 'product', 'products', locale)} on this page ${discounted === 1 ? 'has' : 'have'} a member price`;
    const products =
        hidden === 0
            ? 'none are for members only'
            : `${hidden} ${hidden === 1 ? 'is' : 'are'} for members only`;
    return `Shopping as a member: ${prices}, and ${products}.`;
};
