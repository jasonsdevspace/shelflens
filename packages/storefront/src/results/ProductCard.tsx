import { formatPriceRange } from '../format/money.js';
import type { SearchQuery } from '../generated/operations.js';
import { Swatch } from '../search/Swatch.jsx';

export type Hit = SearchQuery['search']['items'][number];

export interface ProductCardProps {
    readonly product: Hit['product'];
    /** Where the card leads, so it is a real link that opens in a new tab too. */
    readonly href: string;
    readonly onOpen: () => void;
    /** Why the product ranked where it did, shown in explain mode. */
    readonly explain?: { readonly rank: number; readonly hit: Hit } | undefined;
}

type Match = NonNullable<Hit['explanation']>['matches'][number];
type Effect = NonNullable<Hit['explanation']>['rules'][number];

const ROUTES: Record<Match['route'], (match: Match) => string> = {
    EXACT: (m) => `"${m.typed}" matched "${m.matched}" in the ${m.field}`,
    PREFIX: (m) => `"${m.typed}" is the start of "${m.matched}" in the ${m.field}`,
    SYNONYM: (m) => `"${m.typed}" is a synonym of "${m.matched}" in the ${m.field}`,
    CORRECTED: (m) => `"${m.typed}" corrected to "${m.matched}" in the ${m.field}`,
};

const effectText = (effect: Effect): string => {
    const weight = effect.weight === null ? '' : ` by ${effect.weight}`;
    if (effect.action === 'PIN') return `Pinned to the top by rule ${effect.ruleId}`;
    if (effect.action === 'BOOST') return `Boosted${weight} by rule ${effect.ruleId}`;
    return `Buried${weight} by rule ${effect.ruleId}`;
};

/** Why one result ranked where it did, in plain words. */
const Explanation = ({ rank, hit }: { readonly rank: number; readonly hit: Hit }) => {
    const matches = hit.explanation?.matches ?? [];
    const rules = hit.explanation?.rules ?? [];
    return (
        <ul className="card-explain" aria-label={`Why this is result ${rank}`}>
            <li>
                Result {rank}
                {hit.score !== undefined && `, score ${hit.score.toFixed(2)}`}
            </li>
            {matches.map((match, index) => (
                <li key={index}>{ROUTES[match.route](match)}</li>
            ))}
            {matches.length === 0 && rules.length > 0 && <li>Did not match the phrase</li>}
            {rules.map((effect) => (
                <li key={effect.ruleId}>{effectText(effect)}</li>
            ))}
        </ul>
    );
};

export const ProductCard = ({ product, href, onOpen, explain }: ProductCardProps) => (
    <li className="card">
        <a
            className="card-link"
            href={href}
            onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onOpen();
            }}
        >
            <Swatch color={product.colors[0]} brand={product.brand.name} size={64} />
            <span className="card-text">
                <span className="card-name">{product.name}</span>
                <span className="card-meta">{product.brand.name}</span>
                <span className="card-price">
                    {formatPriceRange(product.price.min, product.price.max)}
                </span>
                {product.rating && (
                    <span className="card-rating">
                        {product.rating.average.toFixed(1)} from {product.rating.count} ratings
                    </span>
                )}
                {!product.inStock && <span className="card-stock">Out of stock</span>}
            </span>
        </a>
        {explain && <Explanation rank={explain.rank} hit={explain.hit} />}
    </li>
);
