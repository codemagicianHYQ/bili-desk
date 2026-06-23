import { appStore } from '../../store/app-store'
import type {
  CategoryL1,
  CategoryL2,
  CategoryL3,
  CategoryTreeNode,
  ClassificationTask,
  FavoriteItemAssignment,
  UpGroup
} from '@shared/types'

interface DbSchema {
  categoryL1: CategoryL1[]
  categoryL2: CategoryL2[]
  categoryL3: CategoryL3[]
  favoriteItemMap: FavoriteItemAssignment[]
  upGroups: Array<Omit<UpGroup, 'memberCount'> & { sortOrder: number }>
  upMemberMap: Array<{
    id: number
    mid: number
    upGroupId: number
    source: string
    confidence: number
  }>
  upGroupRules: Array<{ id: number; upGroupId: number; ruleJson: string }>
  classificationTasks: ClassificationTask[]
  nextIds: Record<string, number>
  favTaxonomySeeded?: boolean
}

const defaultDb: DbSchema = {
  categoryL1: [
    { id: 1, name: '计算机', icon: 'cpu', sortOrder: 0 },
    { id: 2, name: '其他', icon: 'folder', sortOrder: 1 }
  ],
  categoryL2: [
    { id: 1, categoryL1Id: 1, name: '前端', sortOrder: 0 },
    { id: 2, categoryL1Id: 1, name: '后端', sortOrder: 1 },
    { id: 3, categoryL1Id: 1, name: '计算机网络', sortOrder: 2 },
    { id: 4, categoryL1Id: 1, name: '人工智能', sortOrder: 3 }
  ],
  categoryL3: [],
  favoriteItemMap: [],
  upGroups: [
    { id: 1, name: '未分组', color: '#94a3b8', isAiGenerated: false, sortOrder: 0 },
    { id: 2, name: '技术', color: '#3b82f6', isAiGenerated: true, sortOrder: 1 },
    { id: 3, name: '生活', color: '#22c55e', isAiGenerated: true, sortOrder: 2 }
  ],
  upMemberMap: [],
  upGroupRules: [],
  classificationTasks: [],
  nextIds: { categoryL1: 3, categoryL2: 5, categoryL3: 1, upGroup: 4, task: 1, member: 1, favMap: 1 },
  favTaxonomySeeded: true
}

function getDbData(): DbSchema {
  const stored = appStore.get('localDb' as never) as DbSchema | undefined
  if (!stored) {
    appStore.set('localDb' as never, defaultDb as never)
    return structuredClone(defaultDb)
  }

  if (!stored.categoryL3) stored.categoryL3 = []
  if (!stored.favoriteItemMap) stored.favoriteItemMap = []
  if (!stored.nextIds.categoryL3) stored.nextIds.categoryL3 = 1
  if (!stored.nextIds.favMap) stored.nextIds.favMap = 1
  saveDb(stored)
  return stored
}

function saveDb(data: DbSchema): void {
  appStore.set('localDb' as never, data as never)
}

function nextId(data: DbSchema, key: keyof DbSchema['nextIds']): number {
  const id = data.nextIds[key] ?? 1
  data.nextIds[key] = id + 1
  return id
}

export class TaxonomyRepository {
  ensureDefaultFavTaxonomy(): void {
    const data = getDbData()
    if (data.favTaxonomySeeded) return

    data.categoryL1 = structuredClone(defaultDb.categoryL1)
    data.categoryL2 = structuredClone(defaultDb.categoryL2)
    data.categoryL3 = []
    data.favTaxonomySeeded = true
    saveDb(data)
  }

  /** 补全「学习」「娱乐」「生活」等一级分类，供分类规则使用 */
  ensureExtendedFavTaxonomy(): void {
    this.ensureDefaultFavTaxonomy()
    const data = getDbData()
    const seeds: Array<{ name: string; icon: string; sortOrder: number }> = [
      { name: '计算机', icon: 'cpu', sortOrder: 0 },
      { name: '学习', icon: 'book', sortOrder: 1 },
      { name: '娱乐', icon: 'gamepad', sortOrder: 2 },
      { name: '生活', icon: 'home', sortOrder: 3 },
      { name: '其他', icon: 'folder', sortOrder: 99 }
    ]
    let changed = false
    for (const seed of seeds) {
      if (data.categoryL1.some((item) => item.name === seed.name)) continue
      data.categoryL1.push({
        id: nextId(data, 'categoryL1'),
        name: seed.name,
        icon: seed.icon,
        sortOrder: seed.sortOrder
      })
      changed = true
    }
    if (changed) saveDb(data)
  }

  /**
   * 全量智能分类前重置目录，清除历史重复 L2/L3 与旧映射。
   * 保留一级分类名称（含用户改名），二级仅保留计算机下的默认骨架。
   */
  resetFavCategoriesForClassify(): void {
    this.ensureExtendedFavTaxonomy()
    const data = getDbData()
    const computerL1 = data.categoryL1.find((item) => item.name === '计算机')
    if (!computerL1) return

    data.categoryL2 = []
    data.categoryL3 = []
    data.favoriteItemMap = []

    const defaultL2 = ['前端', '后端', '计算机网络', '人工智能']
    for (let sortOrder = 0; sortOrder < defaultL2.length; sortOrder++) {
      data.categoryL2.push({
        id: nextId(data, 'categoryL2'),
        categoryL1Id: computerL1.id,
        name: defaultL2[sortOrder],
        sortOrder
      })
    }

    saveDb(data)
  }

  listL1(): CategoryL1[] {
    return getDbData().categoryL1.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  createL1(name: string, icon = 'folder'): CategoryL1 {
    const data = getDbData()
    const item: CategoryL1 = {
      id: nextId(data, 'categoryL1'),
      name,
      icon,
      sortOrder: data.categoryL1.length
    }
    data.categoryL1.push(item)
    saveDb(data)
    return item
  }

  createL2(categoryL1Id: number, name: string): CategoryL2 {
    const data = getDbData()
    const siblings = data.categoryL2.filter((c) => c.categoryL1Id === categoryL1Id)
    const item: CategoryL2 = {
      id: nextId(data, 'categoryL2'),
      categoryL1Id,
      name,
      sortOrder: siblings.length
    }
    data.categoryL2.push(item)
    saveDb(data)
    return item
  }

  createL3(categoryL2Id: number, name: string): CategoryL3 {
    const data = getDbData()
    const siblings = data.categoryL3.filter((c) => c.categoryL2Id === categoryL2Id)
    const item: CategoryL3 = {
      id: nextId(data, 'categoryL3'),
      categoryL2Id,
      name,
      sortOrder: siblings.length
    }
    data.categoryL3.push(item)
    saveDb(data)
    return item
  }

  findL1ByName(name: string): CategoryL1 | undefined {
    return this.listL1().find((item) => item.name === name)
  }

  findOrCreateL2(categoryL1Id: number, name: string): CategoryL2 {
    const data = getDbData()
    const existing = data.categoryL2.find((item) => item.categoryL1Id === categoryL1Id && item.name === name)
    if (existing) return existing
    return this.createL2(categoryL1Id, name)
  }

  findOrCreateL3(categoryL2Id: number, name: string): CategoryL3 {
    const data = getDbData()
    const existing = data.categoryL3.find((item) => item.categoryL2Id === categoryL2Id && item.name === name)
    if (existing) return existing
    return this.createL3(categoryL2Id, name)
  }

  updateCategoryName(level: 'l1' | 'l2' | 'l3', id: number, name: string): void {
    const data = getDbData()
    const trimmed = name.trim()
    if (!trimmed) return

    if (level === 'l1') {
      const item = data.categoryL1.find((c) => c.id === id)
      if (item) item.name = trimmed
    } else if (level === 'l2') {
      const item = data.categoryL2.find((c) => c.id === id)
      if (item) item.name = trimmed
    } else {
      const item = data.categoryL3.find((c) => c.id === id)
      if (item) item.name = trimmed
    }
    saveDb(data)
  }

  assignFavorite(input: {
    mediaId: number
    avid: number
    bvid?: string
    title?: string
    categoryL1Id: number | null
    categoryL2Id: number | null
    categoryL3Id: number | null
  }): void {
    this.assignFavoritesBatch([input])
  }

  assignFavoritesBatch(
    inputs: Array<{
      mediaId: number
      avid: number
      bvid?: string
      title?: string
      cover?: string
      upperName?: string
      duration?: number
      categoryL1Id: number | null
      categoryL2Id: number | null
      categoryL3Id: number | null
    }>
  ): void {
    if (inputs.length === 0) return
    const data = getDbData()
    const replaceIds = new Set(inputs.map((item) => item.mediaId))
    data.favoriteItemMap = data.favoriteItemMap.filter((item) => !replaceIds.has(item.mediaId))

    for (const input of inputs) {
      data.favoriteItemMap.push({
        id: nextId(data, 'favMap'),
        mediaId: input.mediaId,
        avid: input.avid,
        bvid: input.bvid ?? '',
        title: input.title ?? '',
        cover: input.cover ?? '',
        upperName: input.upperName ?? '',
        duration: input.duration ?? 0,
        categoryL1Id: input.categoryL1Id,
        categoryL2Id: input.categoryL2Id,
        categoryL3Id: input.categoryL3Id
      })
    }

    saveDb(data)
  }

  createClassificationWriter() {
    const data = getDbData()
    const pendingL2: CategoryL2[] = []
    const pendingL3: CategoryL3[] = []

    const resolveL2ById = (categoryL2Id: number): CategoryL2 | undefined =>
      data.categoryL2.find((item) => item.id === categoryL2Id) ??
      pendingL2.find((item) => item.id === categoryL2Id)

    const findL2 = (categoryL1Id: number, name: string): CategoryL2 | undefined =>
      data.categoryL2.find((item) => item.categoryL1Id === categoryL1Id && item.name === name) ??
      pendingL2.find((item) => item.categoryL1Id === categoryL1Id && item.name === name)

    const findL3 = (categoryL2Id: number, name: string): CategoryL3 | undefined =>
      data.categoryL3.find((item) => item.categoryL2Id === categoryL2Id && item.name === name) ??
      pendingL3.find((item) => item.categoryL2Id === categoryL2Id && item.name === name)

    const findL3InL1 = (categoryL1Id: number, name: string): CategoryL3 | undefined => {
      for (const l3 of [...data.categoryL3, ...pendingL3]) {
        const parent = resolveL2ById(l3.categoryL2Id)
        if (parent?.categoryL1Id === categoryL1Id && l3.name === name) return l3
      }
      return undefined
    }

    return {
      findL1ByName: (name: string) => data.categoryL1.find((item) => item.name === name),
      findOrCreateL1: (name: string, icon = 'folder'): CategoryL1 => {
        const existing = data.categoryL1.find((item) => item.name === name)
        if (existing) return existing
        const item: CategoryL1 = {
          id: nextId(data, 'categoryL1'),
          name,
          icon,
          sortOrder: data.categoryL1.length
        }
        data.categoryL1.push(item)
        return item
      },
      findOrCreateL2: (categoryL1Id: number, name: string): CategoryL2 => {
        const existing = findL2(categoryL1Id, name)
        if (existing) return existing

        const siblings = [
          ...data.categoryL2.filter((item) => item.categoryL1Id === categoryL1Id),
          ...pendingL2.filter((item) => item.categoryL1Id === categoryL1Id)
        ]
        const item: CategoryL2 = {
          id: nextId(data, 'categoryL2'),
          categoryL1Id,
          name,
          sortOrder: siblings.length
        }
        pendingL2.push(item)
        return item
      },
      findOrCreateL3: (categoryL2Id: number, name: string): CategoryL3 => {
        const existing = findL3(categoryL2Id, name)
        if (existing) return existing

        const parentL2 = resolveL2ById(categoryL2Id)
        if (parentL2) {
          const sameInL1 = findL3InL1(parentL2.categoryL1Id, name)
          if (sameInL1) return sameInL1
        }

        const siblings = [
          ...data.categoryL3.filter((item) => item.categoryL2Id === categoryL2Id),
          ...pendingL3.filter((item) => item.categoryL2Id === categoryL2Id)
        ]
        const item: CategoryL3 = {
          id: nextId(data, 'categoryL3'),
          categoryL2Id,
          name,
          sortOrder: siblings.length
        }
        pendingL3.push(item)
        return item
      },
      commitAssignments: (
        assignments: Array<{
          mediaId: number
          avid: number
          bvid: string
          title: string
          cover?: string
          upperName?: string
          duration?: number
          categoryL1Id: number | null
          categoryL2Id: number | null
          categoryL3Id: number | null
        }>
      ) => {
        if (pendingL2.length > 0) data.categoryL2.push(...pendingL2)
        if (pendingL3.length > 0) data.categoryL3.push(...pendingL3)

        const replaceIds = new Set(assignments.map((item) => item.mediaId))
        data.favoriteItemMap = data.favoriteItemMap.filter((item) => !replaceIds.has(item.mediaId))

        for (const input of assignments) {
          data.favoriteItemMap.push({
            id: nextId(data, 'favMap'),
            mediaId: input.mediaId,
            avid: input.avid,
            bvid: input.bvid,
            title: input.title,
            cover: input.cover ?? '',
            upperName: input.upperName ?? '',
            duration: input.duration ?? 0,
            categoryL1Id: input.categoryL1Id,
            categoryL2Id: input.categoryL2Id,
            categoryL3Id: input.categoryL3Id
          })
        }

        saveDb(data)
        this.repairTaxonomy()
      }
    }
  }

  getFavoriteAssignments(): FavoriteItemAssignment[] {
    this.repairTaxonomy()
    return getDbData().favoriteItemMap
  }

  repairTaxonomy(): void {
    const data = getDbData()
    let changed = false

    const seenL2Ids = new Set<number>()
    const dedupedL2: CategoryL2[] = []
    for (const l2 of [...data.categoryL2].sort((a, b) => a.id - b.id)) {
      if (seenL2Ids.has(l2.id)) {
        changed = true
        continue
      }
      seenL2Ids.add(l2.id)
      dedupedL2.push(l2)
    }
    if (dedupedL2.length !== data.categoryL2.length) {
      data.categoryL2 = dedupedL2
    }

    const remapL2 = new Map<number, number>()
    const canonicalL2 = new Map<string, number>()
    for (const l2 of [...data.categoryL2].sort((a, b) => a.id - b.id)) {
      const key = `${l2.categoryL1Id}:${l2.name}`
      const existing = canonicalL2.get(key)
      if (existing == null) {
        canonicalL2.set(key, l2.id)
      } else {
        remapL2.set(l2.id, existing)
        changed = true
      }
    }

    if (remapL2.size > 0) {
      for (const l3 of data.categoryL3) {
        const next = remapL2.get(l3.categoryL2Id)
        if (next != null) {
          l3.categoryL2Id = next
          changed = true
        }
      }
      for (const item of data.favoriteItemMap) {
        if (item.categoryL2Id != null) {
          const next = remapL2.get(item.categoryL2Id)
          if (next != null) {
            item.categoryL2Id = next
            changed = true
          }
        }
      }
      data.categoryL2 = data.categoryL2.filter((l2) => !remapL2.has(l2.id))
    }

    const remapL3 = new Map<number, number>()
    const canonicalL3 = new Map<string, number>()
    for (const l3 of [...data.categoryL3].sort((a, b) => a.id - b.id)) {
      const key = `${l3.categoryL2Id}:${l3.name}`
      const existing = canonicalL3.get(key)
      if (existing == null) {
        canonicalL3.set(key, l3.id)
      } else {
        remapL3.set(l3.id, existing)
        changed = true
      }
    }

    if (remapL3.size > 0) {
      for (const item of data.favoriteItemMap) {
        if (item.categoryL3Id != null) {
          const next = remapL3.get(item.categoryL3Id)
          if (next != null) {
            item.categoryL3Id = next
            changed = true
          }
        }
      }
      data.categoryL3 = data.categoryL3.filter((l3) => !remapL3.has(l3.id))
    }

    const l1ByL2 = new Map(data.categoryL2.map((l2) => [l2.id, l2.categoryL1Id]))
    const l3ByL1Name = new Map<string, CategoryL3[]>()
    for (const l3 of data.categoryL3) {
      const l1Id = l1ByL2.get(l3.categoryL2Id)
      if (l1Id == null) continue
      const key = `${l1Id}:${l3.name}`
      const bucket = l3ByL1Name.get(key) ?? []
      bucket.push(l3)
      l3ByL1Name.set(key, bucket)
    }

    const crossL3Remap = new Map<number, number>()
    for (const group of l3ByL1Name.values()) {
      if (group.length <= 1) continue
      const ranked = group
        .map((l3) => ({
          l3,
          count: data.favoriteItemMap.filter((item) => item.categoryL3Id === l3.id).length
        }))
        .sort((a, b) => b.count - a.count || a.l3.id - b.l3.id)
      const keep = ranked[0].l3
      for (let index = 1; index < ranked.length; index++) {
        crossL3Remap.set(ranked[index].l3.id, keep.id)
        changed = true
      }
    }

    if (crossL3Remap.size > 0) {
      for (const item of data.favoriteItemMap) {
        if (item.categoryL3Id == null) continue
        const next = crossL3Remap.get(item.categoryL3Id)
        if (next != null) {
          item.categoryL3Id = next
        }
      }
      data.categoryL3 = data.categoryL3.filter((l3) => !crossL3Remap.has(l3.id))
    }

    for (const item of data.favoriteItemMap) {
      if (item.categoryL3Id == null) continue
      const l3 = data.categoryL3.find((c) => c.id === item.categoryL3Id)
      if (!l3) {
        item.categoryL3Id = null
        changed = true
        continue
      }
      if (item.categoryL2Id !== l3.categoryL2Id) {
        item.categoryL2Id = l3.categoryL2Id
        changed = true
      }
      const l2 = data.categoryL2.find((c) => c.id === l3.categoryL2Id)
      if (l2 && item.categoryL1Id !== l2.categoryL1Id) {
        item.categoryL1Id = l2.categoryL1Id
        changed = true
      }
    }

    const referencedL3 = new Set(
      data.favoriteItemMap.map((item) => item.categoryL3Id).filter((id): id is number => id != null)
    )
    const beforeL3 = data.categoryL3.length
    data.categoryL3 = data.categoryL3.filter((l3) => referencedL3.has(l3.id))
    if (data.categoryL3.length !== beforeL3) changed = true

    const referencedL2 = new Set<number>([
      ...data.favoriteItemMap.map((item) => item.categoryL2Id).filter((id): id is number => id != null),
      ...data.categoryL3.map((l3) => l3.categoryL2Id)
    ])
    const beforeL2 = data.categoryL2.length
    data.categoryL2 = data.categoryL2.filter((l2) => referencedL2.has(l2.id))
    if (data.categoryL2.length !== beforeL2) changed = true

    if (changed) saveDb(data)
  }

  enrichFavoriteCovers(
    briefs: Array<{ bvid: string; cover: string; upperName: string; duration: number }>
  ): number {
    if (briefs.length === 0) return 0
    const data = getDbData()
    const byBvid = new Map(briefs.map((item) => [item.bvid, item]))
    let updated = 0

    for (const item of data.favoriteItemMap) {
      if (!item.bvid || item.cover) continue
      const brief = byBvid.get(item.bvid)
      if (!brief?.cover) continue
      item.cover = brief.cover
      if (!item.upperName) item.upperName = brief.upperName
      if (!item.duration) item.duration = brief.duration
      updated++
    }

    if (updated > 0) saveDb(data)
    return updated
  }

  getMissingCoverBvids(limit = 80): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of getDbData().favoriteItemMap) {
      if (!item.bvid || item.cover || seen.has(item.bvid)) continue
      seen.add(item.bvid)
      result.push(item.bvid)
      if (result.length >= limit) break
    }
    return result
  }

  getMissingCoverCount(): number {
    const seen = new Set<string>()
    let count = 0
    for (const item of getDbData().favoriteItemMap) {
      if (!item.bvid || item.cover || seen.has(item.bvid)) continue
      seen.add(item.bvid)
      count++
    }
    return count
  }

  getAssignmentByMediaId(mediaId: number): FavoriteItemAssignment | undefined {
    return getDbData().favoriteItemMap.find((item) => item.mediaId === mediaId)
  }

  matchesLocalCategory(
    mediaId: number,
    selection: { level: 'all' | 'l1' | 'l2' | 'l3' | 'uncategorized'; id: number | null }
  ): boolean {
    if (selection.level === 'all') return true

    const assignment = this.getAssignmentByMediaId(mediaId)
    if (selection.level === 'uncategorized') {
      return !assignment || (!assignment.categoryL1Id && !assignment.categoryL2Id && !assignment.categoryL3Id)
    }
    if (!assignment) return false

    const data = getDbData()

    if (selection.level === 'l3' && selection.id != null) {
      return assignment.categoryL3Id === selection.id
    }

    if (selection.level === 'l2' && selection.id != null) {
      if (assignment.categoryL2Id === selection.id) return true
      const l3Ids = data.categoryL3.filter((c) => c.categoryL2Id === selection.id).map((c) => c.id)
      return assignment.categoryL3Id != null && l3Ids.includes(assignment.categoryL3Id)
    }

    if (selection.level === 'l1' && selection.id != null) {
      if (assignment.categoryL1Id === selection.id) return true
      const l2Ids = data.categoryL2.filter((c) => c.categoryL1Id === selection.id).map((c) => c.id)
      if (assignment.categoryL2Id != null && l2Ids.includes(assignment.categoryL2Id)) return true
      if (assignment.categoryL3Id != null) {
        const l3 = data.categoryL3.find((c) => c.id === assignment.categoryL3Id)
        if (l3 && l2Ids.includes(l3.categoryL2Id)) return true
      }
    }

    return false
  }

  getTree(): CategoryTreeNode[] {
    this.repairTaxonomy()
    const data = getDbData()
    return this.listL1().map((l1) => ({
      id: l1.id,
      name: l1.name,
      icon: l1.icon,
      sortOrder: l1.sortOrder,
      children: data.categoryL2
        .filter((l2) => l2.categoryL1Id === l1.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l2) => ({
          id: l2.id,
          name: l2.name,
          sortOrder: l2.sortOrder,
          children: data.categoryL3
            .filter((l3) => l3.categoryL2Id === l2.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((l3) => ({ id: l3.id, name: l3.name, sortOrder: l3.sortOrder }))
        }))
    }))
  }

  getCategoryCounts(): Record<string, number> {
    const counts: Record<string, number> = { all: 0, uncategorized: 0 }
    const data = getDbData()
    const assignedIds = new Set<number>()

    for (const item of data.favoriteItemMap) {
      assignedIds.add(item.mediaId)
      counts.all++

      if (item.categoryL1Id) counts[`l1:${item.categoryL1Id}`] = (counts[`l1:${item.categoryL1Id}`] ?? 0) + 1
      if (item.categoryL2Id) counts[`l2:${item.categoryL2Id}`] = (counts[`l2:${item.categoryL2Id}`] ?? 0) + 1
      if (item.categoryL3Id) counts[`l3:${item.categoryL3Id}`] = (counts[`l3:${item.categoryL3Id}`] ?? 0) + 1
    }

    counts.uncategorized = counts.all
    return counts
  }

  getUpGroups(): UpGroup[] {
    const data = getDbData()
    return data.upGroups
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        isAiGenerated: g.isAiGenerated,
        sortOrder: g.sortOrder,
        memberCount: data.upMemberMap.filter((m) => m.upGroupId === g.id).length
      }))
  }

  getUpGroupMemberMids(groupId: number): number[] {
    return getDbData()
      .upMemberMap.filter((m) => m.upGroupId === groupId)
      .map((m) => m.mid)
  }

  createUpGroup(name: string, color = '#FB7299'): UpGroup {
    const data = getDbData()
    const item = {
      id: nextId(data, 'upGroup'),
      name,
      color,
      isAiGenerated: false,
      sortOrder: data.upGroups.length
    }
    data.upGroups.push(item)
    saveDb(data)
    return { ...item, memberCount: 0 }
  }

  createTask(type: string): ClassificationTask {
    const data = getDbData()
    const task: ClassificationTask = {
      id: nextId(data, 'task'),
      type,
      status: 'pending',
      progress: 0,
      message: '等待执行'
    }
    data.classificationTasks.push(task)
    saveDb(data)
    return task
  }

  updateTask(
    id: number,
    patch: Partial<Pick<ClassificationTask, 'status' | 'progress' | 'message'>>
  ): void {
    const data = getDbData()
    const task = data.classificationTasks.find((t) => t.id === id)
    if (task) Object.assign(task, patch)
    saveDb(data)
  }

  getTask(id: number): ClassificationTask | null {
    return getDbData().classificationTasks.find((t) => t.id === id) ?? null
  }

  assignUp(mid: number, groupId: number, source: string, confidence: number): void {
    const data = getDbData()
    data.upMemberMap = data.upMemberMap.filter((m) => m.mid !== mid)
    data.upMemberMap.push({
      id: nextId(data, 'member'),
      mid,
      upGroupId: groupId,
      source,
      confidence
    })
    saveDb(data)
  }
}

export const taxonomyRepo = new TaxonomyRepository()

export function initDb(): void {
  getDbData()
}
