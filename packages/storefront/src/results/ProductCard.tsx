import { useStoreInfo } from '../app/StoreContext.jsx';
import { formatPriceRange } from '../format/money.js';
import type { CardFragment, SearchQuery } from '../generated/operations.js';
import { Swatch } from '../search/Swatch.jsx';

export type Hit = SearchQuery['search']['items'][number];

export interface ProductCardProps {
    readonly product: CardFragment;
    /** Where the card leads, so it is a real link that opens in a new tab too. */
    readonly href: string;
    readonly onOpen: () => void;
    /** Why the product ranked where it did, shown in explain mode. */
    readonly explain?: ExplainProps | undefined;
}

export interface ExplainProps {
    readonly rank: number;
    readonly hit: Hit;
    /** Whether a phrase was typed, so "did not match it" means something. */
    readonly phrase: boolean;
}

type Match = NonNullable<Hit['explanation']>['matches'][number];
type Effect = NonNullable<Hit['explanation']>['rules'][number];

const ROUTES: Partial<Record<Match['route'], (match: Match) => string>> = {
    EXACT: (m) => `"${m.typed}" matched "${m.matched}" in the ${m.field}`,
    PREFIX: (m) => `"${m.typed}" is the start of "${m.matched}" in the ${m.field}`,
    SYNONYM: (m) => `"${m.typed}" is a synonym of "${m.matched}" in the ${m.field}`,
    CORRECTED: (m) => `"${m.typed}" corrected to "${m.matched}" in the ${m.field}`,
};

/** A route the page does not know yet still reads as a match. */
const matchText = (match: Match): string =>
    (ROUTES[match.route] ?? ROUTES.EXACT ?? (() => ''))(match);

const effectText = (effect: Effect): string => {
    const weight = effect.weight === null ? '' : ` by ${effect.weight}`;
    if (effect.action === 'PIN') return `Pinned to the top by rule ${effect.ruleId}`;
    if (effect.action === 'BOOST') return `Boosted${weight} by rule ${effect.ruleId}`;
    return `Buried${weight} by rule ${effect.ruleId}`;
};

/**
 * Why one result ranked where it did, in plain words, in the order the
 * question is asked: where it landed, what a rule did to it, then what it
 * matched. Rendered only once the answer carrying the explanation has
 * landed, so turning explain mode on never shows a bare rank.
 */
const Explanation = ({ rank, hit, phrase }: ExplainProps) => {
    if (!hit.explanation) return null;
    const { matches, rules } = hit.explanation;
    return (
        <ul className="card-explain" aria-label={`Why this is result ${rank}`}>
            <li>
                Result {rank}
                {hit.score !== undefined && `, score ${hit.score.toFixed(2)}`}
            </li>
            {rules.map((effect, index) => (
                <li key={`${effect.ruleId}-${effect.action}-${index}`}>{effectText(effect)}</li>
            ))}
            {matches.map((match, index) => (
                <li key={index}>{matchText(match)}</li>
            ))}
            {phrase && matches.length === 0 && rules.length > 0 && (
                <li>Did not match the phrase</li>
            )}
        </ul>
    );
};

export const ProductCard = ({ product, href, onOpen, explain }: ProductCardProps) => {
    const { locale } = useStoreInfo();
    return (
        <li className="card">
            <a
                className="card-link"
                href={href}
                onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                        return;
                    event.preventDefault();
                    onOpen();
                }}
            >
                <Swatch color={product.colors[0]} brand={product.brand.name} size={64} />
                <span className="card-text">
                    <span className="card-name">{product.name}</span>
                    <span className="card-meta">{product.brand.name}</span>
                    <span className="card-price">
                        {formatPriceRange(product.price.min, product.price.max, locale)}
                    </span>
                    {product.rating && (
                        <span className="card-rating">
                            {product.rating.average.toFixed(1)} from {product.rating.count} ratings
                        </span>
                    )}
                    {!product.inStock && <span className="card-stock">Out of stock</span>}
                </span>
            </a>
            {explain && <Explanation {...explain} />}
        </li>
    );
};
