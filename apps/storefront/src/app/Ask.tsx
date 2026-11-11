import { Button } from '@jasonsdevspace/design-kit/react';
import { useId, useLayoutEffect, useRef } from 'react';

/**
 * A question with its two answers, the question as a line and the answers in a row under it, since
 * the kit's text buttons sit beside a block rather than in running text. The answer that keeps
 * things as they are takes focus, so a repeated key press never confirms a discard unread.
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
        <div className="ask" role="group" aria-labelledby={id}>
            <p id={id}>{question}</p>
            <div className="actions">
                <Button text onClick={onYes}>
                    {yes}
                </Button>
                <Button ref={safe} text onClick={onNo}>
                    {no}
                </Button>
            </div>
        </div>
    );
};
