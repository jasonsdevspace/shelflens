import { type CategoryTree, childrenOf } from './categories.js';
import { StateLink } from './StateLink.jsx';
import { EMPTY_STATE, type SearchState } from './url.js';
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
                            <StateLink
                                className="category-link"
                                to={target}
                                navigate={navigate}
                                current={current === root.id}
                            >
                                {root.name}
                            </StateLink>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
