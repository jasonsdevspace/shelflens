import { useSaidLater } from './LiveStatus.jsx';
import { SetApart } from './SetApart.jsx';

/**
 * A problem, said in an alert that is in the page before it is filled, so it
 * is heard though what it belongs to has just been shown. An alert
 * created with its words already in it is not reliably read. It is the kit's
 * callout for something that went wrong, out of sight while it waits.
 */
export const ProblemAlert = ({ problem }: { readonly problem: string | undefined }) => {
    const shown = useSaidLater(problem ?? '');
    return (
        <SetApart waiting={shown === ''} tone="danger" live="alert">
            {shown}
        </SetApart>
    );
};
