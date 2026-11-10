import { DemoFooter, PortfolioStrip } from '@jasonsdevspace/design-kit/react';
import type { ReactNode } from 'react';

/*
 * The two pieces of chrome that say whose work this is, the design kit's strip above the masthead
 * and its footer below the content, with ShelfLens's links in them.
 *
 * The strip answers the questions a visitor has on landing, who made this, what it shows and where
 * the code is, and nothing more, so the ShelfLens wordmark stays the product's first read. The
 * footer is the exit after a long scroll and carries the rest.
 */

export const REPO_URL = 'https://github.com/jasonsdevspace/shelflens';
/** The explainer, beside the demo wherever the demo is served from. */
const ABOUT_URL = `${import.meta.env.BASE_URL}about/`;
/** The page where a visitor searches a file of their own products. */
const TRY_URL = `${import.meta.env.BASE_URL}try/`;

export const Strip = ({
    tools,
    toolsWaiting = false,
}: {
    readonly tools?: ReactNode;
    /** Whether the demo's switches are on their way, so the strip keeps their room. */
    readonly toolsWaiting?: boolean;
}) => (
    <PortfolioStrip about={ABOUT_URL} source={REPO_URL} tools={tools} toolsWaiting={toolsWaiting} />
);

export const Footer = () => (
    <DemoFooter name="ShelfLens" about={ABOUT_URL} source={REPO_URL}>
        You can also <a href={TRY_URL}>search your own products</a> with ShelfLens.
    </DemoFooter>
);
