import { Callout } from '@jasonsdevspace/design-kit/react';
import type { ComponentProps } from 'react';

/**
 * A line the page sets apart: the design kit's callout, with the room the store keeps below it. A
 * live callout the page mounts before it has words leaves the flow until it is filled, as the kit
 * draws one, so it opens no gap where it sits and its room goes with it.
 */
export const SetApart = ({ className, ...callout }: ComponentProps<typeof Callout>) => (
    <Callout
        {...callout}
        className={className === undefined ? 'callout' : `callout ${className}`}
    />
);
