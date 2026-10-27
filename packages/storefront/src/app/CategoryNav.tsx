import { type CategoryTree, childrenOf } from './categories.js';
import { EMPTY_STATE, type SearchState, serializeSearchState } from './url.js';
import type { Navigate } from './useUrlState.js';

/** The root categories, as the store's main navigation. */
export const CategoryNav = ({
    categories,
    state,
    navigate,
}: {
    readonly categories: CategoryTree;
    readonly state: SearchState;
    readonly navigate: Navigate;
}) => {
    const roots = childrenOf(categories, undefined);
    if (roots.length === 0) return null;
    const current = state.product ? undefined : categories.get(state.category ?? '')?.path[0];
    return (
        <nav className="category-nav" aria-label="Categories">
            <ul className="category-list">
                {roots.map((root) => {
                    const target: SearchState = { ...EMPTY_STATE, category: root.id };
                    return (
                        <li key={root.id}>
                            <a
                                className="category-link"
                                href={serializeSearchState(target)}
                                aria-current={current === root.id ? 'page' : undefined}
                                onClick={(event) => {
                                    event.preventDefault();
                                    navigate(target);
                                }}
                            >
                                {root.name}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
