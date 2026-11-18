import type { CategoryTreeNode, FavoriteItemAssignment, FavResource, LocalCategorySelection } from '../types';
export declare function matchesLocalCategory(mediaId: number, assignments: FavoriteItemAssignment[], selection: LocalCategorySelection, tree: CategoryTreeNode[]): boolean;
export declare function countByLocalSelection(assignments: FavoriteItemAssignment[], selection: LocalCategorySelection, tree: CategoryTreeNode[]): number;
export declare function enrichTreeWithCounts(tree: CategoryTreeNode[], assignments: FavoriteItemAssignment[]): CategoryTreeNode[];
export declare function filterAssignmentsByCategory(assignments: FavoriteItemAssignment[], selection: LocalCategorySelection, tree: CategoryTreeNode[]): FavoriteItemAssignment[];
export declare function assignmentToFavResource(assignment: FavoriteItemAssignment): FavResource;
