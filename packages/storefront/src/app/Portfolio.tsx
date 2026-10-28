/**
 * The two pieces of chrome that say whose demo this is: a strip above the
 * masthead and a footer below the content.
 *
 * The strip answers the questions a visitor has on landing, who made this
 * and where the code is, and nothing more, so the ShelfLens wordmark stays
 * the product's first read. It is a navigation landmark rather than a
 * second banner, which an accessibility audit would flag. The footer is
 * the exit after a long scroll and carries the rest.
 */

export const PORTFOLIO_URL = 'https://jasonsdevspace.com/';
export const PORTFOLIO_WORK_URL = 'https://jasonsdevspace.com/#work';
export const GITHUB_PROFILE_URL = 'https://github.com/jasonsdevspace';
export const REPO_URL = 'https://github.com/jasonsdevspace/shelflens';
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

export const PortfolioStrip = () => (
    <nav className="portfolio" aria-label="Portfolio">
        <a href={PORTFOLIO_WORK_URL}>A demo by Jason Poteet</a>
        <a href={REPO_URL}>Source on GitHub</a>
    </nav>
);

export const DemoFooter = () => (
    <footer className="colophon">
        <p>
            ShelfLens is a portfolio project by <a href={PORTFOLIO_URL}>Jason Poteet</a>. The{' '}
            <a href={REPO_URL}>source</a> and <a href={GITHUB_PROFILE_URL}>more work</a> are on
            GitHub, under the <a href={LICENSE_URL}>MIT license</a>.
        </p>
    </footer>
);
