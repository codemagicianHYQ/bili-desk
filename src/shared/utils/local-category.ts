import type { CategoryTreeNode, FavoriteItemAssignment, FavResource, LocalCategorySelection } from '../types'

export function matchesLocalCategory(
  mediaId: number,
  assignments: FavoriteItemAssignment[],
  selection: LocalCategorySelection,
  tree: CategoryTreeNode[]
): boolean {
  if (selection.level === 'all') return true

  const assignment = assignments.find((item) => item.mediaId === mediaId)
  if (selection.level === 'uncategorized') {
    return !assignment || (!assignment.categoryL1Id && !assignment.categoryL2Id && !assignment.categoryL3Id)
  }
  if (!assignment) return false

  if (selection.level === 'l3' && selection.id != null) {
    return assignment.categoryL3Id === selection.id
  }

  if (selection.level === 'l2' && selection.id != null) {
    if (assignment.categoryL2Id === selection.id) return true
    const l2Node = tree.flatMap((l1) => l1.children).find((l2) => l2.id === selection.id)
    const l3Ids = l2Node?.children.map((l3) => l3.id) ?? []
    return assignment.categoryL3Id != null && l3Ids.includes(assignment.categoryL3Id)
  }

  if (selection.level === 'l1' && selection.id != null) {
    if (assignment.categoryL1Id === selection.id) return true
    const l1Node = tree.find((l1) => l1.id === selection.id)
    const l2Ids = l1Node?.children.map((l2) => l2.id) ?? []
    if (assignment.categoryL2Id != null && l2Ids.includes(assignment.categoryL2Id)) return true
    if (assignment.categoryL3Id != null && l1Node) {
      for (const l2 of l1Node.children) {
        if (l2.children.some((l3) => l3.id === assignment.categoryL3Id)) return true
      }
    }
  }

  return false
}

export function countByLocalSelection(
  assignments: FavoriteItemAssignment[],
  selection: LocalCategorySelection,
  tree: CategoryTreeNode[]
): number {
  const ids = new Set(assignments.map((item) => item.mediaId))
  if (selection.level === 'all') return ids.size
  return assignments.filter((item) => matchesLocalCategory(item.mediaId, assignments, selection, tree)).length
}

export function enrichTreeWithCounts(
  tree: CategoryTreeNode[],
  assignments: FavoriteItemAssignment[]
): CategoryTreeNode[] {
  return tree.map((l1) => ({
    ...l1,
    count: countByLocalSelection(assignments, { level: 'l1', id: l1.id }, tree),
    children: l1.children.map((l2) => ({
      ...l2,
      count: countByLocalSelection(assignments, { level: 'l2', id: l2.id }, tree),
      children: l2.children.map((l3) => ({
        ...l3,
        count: countByLocalSelection(assignments, { level: 'l3', id: l3.id }, tree)
      }))
    }))
  }))
}

export function filterAssignmentsByCategory(
  assignments: FavoriteItemAssignment[],
  selection: LocalCategorySelection,
  tree: CategoryTreeNode[]
): FavoriteItemAssignment[] {
  if (selection.level === 'all') return assignments
  return assignments.filter((item) => matchesLocalCategory(item.mediaId, assignments, selection, tree))
}

export function assignmentToFavResource(assignment: FavoriteItemAssignment): FavResource {
  return {
    id: assignment.mediaId,
    bvid: assignment.bvid,
    title: assignment.title,
    cover: assignment.cover ?? '',
    upper: { mid: 0, name: assignment.upperName ?? '' },
    duration: assignment.duration ?? 0
  }
}
