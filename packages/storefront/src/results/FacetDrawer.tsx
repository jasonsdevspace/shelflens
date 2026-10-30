import type { ReactNode } from 'react';

import { Drawer } from './Drawer.jsx';

/**
 * The facets as a drawer, for a phone. The shopper can tick several facets
 * and then see the results in one step.
 */

export interface FacetDrawerProps {
    /** How many facets are narrowing the results, shown on the button. */
    readonly active: number;
    /** How many results the current facets give, shown on the way out. */
    readonly total: number;
    readonly children: ReactNode;
}

export const FacetDrawer = ({ active, total, children }: FacetDrawerProps) => (
    <Drawer
        opener={<>Filters{active > 0 && <span className="drawer-badge"> {active}</span>}</>}
        title="Filters"
        done={`Show ${total} results`}
    >
        {children}
    </Drawer>
);
