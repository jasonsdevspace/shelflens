import { useId, useLayoutEffect, useRef } from 'react';

import { useSaidLater } from '../app/LiveStatus.jsx';
import { SetApart } from '../app/SetApart.jsx';

/**
 * A problem, said in an alert that is in the page before it is filled, so it
 * is heard though the stage it belongs to has just been shown. An alert
 * created with its words already in it is not reliably read. It is the kit's
 * callout for something that went wrong, out of sight while it waits, since
 * an empty callout still draws its ground.
 */
export const ProblemAlert = ({ problem }: { readonly problem: string | undefined }) => {
    const shown = useSaidLater(problem ?? '');
    return (
        <SetApart waiting={shown === ''} tone="danger" live="alert">
            {shown}
        </SetApart>
    );
};

/**
 * A question with its two answers. The answer that keeps things as they are
 * takes focus, so a repeated key press never confirms a discard unread.
 */
export const Ask = ({
    question,
    yes,
    no,
    onYes,
    onNo,
}: {
    readonly question: string;
    readonly yes: string;
    readonly no: string;
    readonly onYes: () => void;
    readonly onNo: () => void;
}) => {
    const id = useId();
    const safe = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => safe.current?.focus(), []);
    // A group named by the question, so the answer that takes focus is read with the question
    // it answers, once.
    return (
        <div className="try-ask" role="group" aria-labelledby={id}>
            <span id={id}>{question}</span>{' '}
            <button type="button" className="text-button" onClick={onYes}>
                {yes}
            </button>{' '}
            <button ref={safe} type="button" className="text-button" onClick={onNo}>
                {no}
            </button>
        </div>
    );
};
