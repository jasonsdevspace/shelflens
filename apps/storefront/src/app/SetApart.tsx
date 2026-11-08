import { Callout } from '@jasonsdevspace/design-kit/react';
import type { ComponentProps } from 'react';

/**
 * A line the page sets apart: the design kit's callout, in a holder that keeps the room below it. A live callout the page mounts before it has
 * words waits in a holder out of sight, and shows once it is filled. The kit draws an empty one as
 * nothing, but it is still in the flow, and some sit in a grid whose gap would open around it.
 */
export const SetApart = ({
    waiting = false,
    className,
    ...callout
}: Omit<ComponentProps<typeof Callout>, 'className'> & {
    /** Whether the callout has no words yet, and waits out of sight. */
    readonly waiting?: boolean;
    /** A class of the holder's own, such as one a tour stop lands on. */
    readonly className?: string | undefined;
}) => (
    <div
        className={[waiting ? 'visually-hidden' : 'callout', className]
            .filter((name) => name !== undefined)
            .join(' ')}
    >
        <Callout {...callout} />
    </div>
);
