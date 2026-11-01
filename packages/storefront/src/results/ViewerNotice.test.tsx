import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewerNotice } from './ViewerNotice.jsx';

describe('the viewer notice', () => {
    it('ends a switch whose first answer has nothing to show, so it is never said late', () => {
        const onHeard = vi.fn();
        render(
            <ViewerNotice
                group="member"
                items={[]}
                shown
                answered
                heard={false}
                onHeard={onHeard}
            />
        );
        expect(onHeard).toHaveBeenCalledOnce();
        expect(document.querySelector('[role="status"]')?.textContent).toBe('');
    });
});
