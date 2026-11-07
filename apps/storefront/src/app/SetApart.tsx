import { Callout } from '@jasonsdevspace/design-kit/react';
import type { ComponentProps } from 'react';

/**
 * A line the page sets apart: the design kit's callout, in a holder that keeps the room below it,
 * since the callout takes no class of the page's. A live callout the page mounts before it has
 * words draws nothing until it is filled, so its holder keeps no room below it while it waits.
 */
export const SetApart = ({
    waiting = false,
    className,
    ...callout
}: ComponentProps<typeof Callout> & {
    /** Whether the callout has no words yet, and keeps no room below it. */
    readonly waiting?: boolean;
    /** A class of the holder's own, such as one a tour stop lands on. */
    readonly className?: string | undefined;
}) => (
    <div
        className={[waiting ? undefined : 'callout', className]
            .filter((name) => name !== undefined)
            .join(' ')}
    >
        <Callout {...callout} />
    </div>
);
