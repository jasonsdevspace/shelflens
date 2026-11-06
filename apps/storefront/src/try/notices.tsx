import { useId, useLayoutEffect, useRef } from 'react';

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
