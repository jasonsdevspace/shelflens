import type { CategoriesQuery } from '../generated/operations.js';

/** A category as the storefront uses it: its id, name and path from the root. */
export type Category = CategoriesQuery['categories'][number];

export type CategoryTree = ReadonlyMap<string, Category>;

export const EMPTY_TREE: CategoryTree = new Map();

export const treeOf = (categories: readonly Category[] | undefined): CategoryTree =>
    new Map((categories ?? []).map((category) => [category.id, category]));

/** The roots, or the children of a category: what a shopper can step into next. */
export const childrenOf = (tree: CategoryTree, parentId: string | undefined): Category[] => {
    const parent = parentId === undefined ? undefined : tree.get(parentId);
    const depth = parent ? parent.path.length : 0;
    return [...tree.values()].filter(
        (category) =>
            category.path.length === depth + 1 &&
            (!parent || category.path[depth - 1] === parent.id)
    );
};

/** The category and its ancestors, root first, for a breadcrumb. */
export const ancestry = (tree: CategoryTree, id: string | undefined): Category[] => {
    const category = id === undefined ? undefined : tree.get(id);
    return category
        ? category.path.flatMap((ancestorId) => {
              const ancestor = tree.get(ancestorId);
              return ancestor ? [ancestor] : [];
          })
        : [];
};
