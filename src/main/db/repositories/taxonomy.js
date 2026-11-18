import { appStore } from "../../store/app-store";
function upGroupMatches(group, name) {
    return group.name === name || group.sourceName === name;
}
const UP_L1_COLORS = {
    计算机: "#3b82f6",
    AI: "#06b6d4",
    技能: "#ec4899",
    科技: "#6366f1",
    学习: "#8b5cf6",
    人文社科: "#a16207",
    财经商业: "#eab308",
    娱乐: "#f59e0b",
    生活: "#22c55e",
    其他: "#94a3b8",
};
/** 关注分组按分类结果按需创建，新库只预置「未分组」 */
const UP_TAXONOMY_SEED = [];
function buildSeedUpGroups() {
    const groups = [
        {
            id: 1,
            name: "未分组",
            color: "#94a3b8",
            isAiGenerated: false,
            sortOrder: 0,
            parentId: null,
        },
    ];
    let nextId = 2;
    let l1Sort = 1;
    for (const l1 of UP_TAXONOMY_SEED) {
        const l1Id = nextId++;
        groups.push({
            id: l1Id,
            name: l1.name,
            color: UP_L1_COLORS[l1.name] ?? "#64748b",
            isAiGenerated: true,
            sortOrder: l1Sort++,
            parentId: null,
        });
        for (let index = 0; index < l1.children.length; index++) {
            groups.push({
                id: nextId++,
                name: l1.children[index],
                color: UP_L1_COLORS[l1.name] ?? "#64748b",
                isAiGenerated: true,
                sortOrder: index,
                parentId: l1Id,
            });
        }
    }
    return groups;
}
function migrateUpTaxonomyToV2(data) {
    data.upGroups = buildSeedUpGroups();
    data.upMemberMap = [];
    data.nextIds.upGroup =
        Math.max(...data.upGroups.map((group) => group.id)) + 1;
    data.upTaxonomyVersion = 2;
}
const defaultDb = {
    categoryL1: [
        { id: 1, name: "计算机", icon: "cpu", sortOrder: 0 },
        { id: 2, name: "其他", icon: "folder", sortOrder: 1 },
    ],
    categoryL2: [
        { id: 1, categoryL1Id: 1, name: "前端", sortOrder: 0 },
        { id: 2, categoryL1Id: 1, name: "后端", sortOrder: 1 },
        { id: 3, categoryL1Id: 1, name: "计算机网络", sortOrder: 2 },
        { id: 4, categoryL1Id: 1, name: "人工智能", sortOrder: 3 },
    ],
    categoryL3: [],
    favoriteItemMap: [],
    upGroups: buildSeedUpGroups(),
    upMemberMap: [],
    upGroupRules: [],
    classificationTasks: [],
    nextIds: {
        categoryL1: 3,
        categoryL2: 5,
        categoryL3: 1,
        upGroup: 35,
        task: 1,
        member: 1,
        favMap: 1,
    },
    favTaxonomySeeded: true,
    upTaxonomyVersion: 2,
};
function getDbData() {
    const stored = appStore.get("localDb");
    if (!stored) {
        appStore.set("localDb", defaultDb);
        return structuredClone(defaultDb);
    }
    let migrated = false;
    if (!stored.categoryL3) {
        stored.categoryL3 = [];
        migrated = true;
    }
    if (!stored.favoriteItemMap) {
        stored.favoriteItemMap = [];
        migrated = true;
    }
    if (!stored.nextIds.categoryL3) {
        stored.nextIds.categoryL3 = 1;
        migrated = true;
    }
    if (!stored.nextIds.favMap) {
        stored.nextIds.favMap = 1;
        migrated = true;
    }
    for (const group of stored.upGroups) {
        if (group.parentId === undefined) {
            group.parentId = null;
            migrated = true;
        }
    }
    if (!stored.upTaxonomyVersion || stored.upTaxonomyVersion < 2) {
        migrateUpTaxonomyToV2(stored);
        migrated = true;
    }
    if (migrated)
        saveDb(stored);
    return stored;
}
function saveDb(data) {
    appStore.set("localDb", data);
}
function nextId(data, key) {
    const id = data.nextIds[key] ?? 1;
    data.nextIds[key] = id + 1;
    return id;
}
export class TaxonomyRepository {
    ensureDefaultFavTaxonomy() {
        const data = getDbData();
        if (data.favTaxonomySeeded)
            return;
        data.categoryL1 = structuredClone(defaultDb.categoryL1);
        data.categoryL2 = structuredClone(defaultDb.categoryL2);
        data.categoryL3 = [];
        data.favTaxonomySeeded = true;
        saveDb(data);
    }
    /** 补全「学习」「娱乐」「生活」等一级分类，供分类规则使用 */
    ensureExtendedFavTaxonomy() {
        this.ensureDefaultFavTaxonomy();
        const data = getDbData();
        const seeds = [
            { name: "计算机", icon: "cpu", sortOrder: 0 },
            { name: "学习", icon: "book", sortOrder: 1 },
            { name: "娱乐", icon: "gamepad", sortOrder: 2 },
            { name: "生活", icon: "home", sortOrder: 3 },
            { name: "其他", icon: "folder", sortOrder: 99 },
        ];
        let changed = false;
        for (const seed of seeds) {
            if (data.categoryL1.some((item) => item.name === seed.name))
                continue;
            data.categoryL1.push({
                id: nextId(data, "categoryL1"),
                name: seed.name,
                icon: seed.icon,
                sortOrder: seed.sortOrder,
            });
            changed = true;
        }
        if (changed)
            saveDb(data);
    }
    /**
     * 全量智能分类前重置目录，清除历史重复 L2/L3 与旧映射。
     * 保留一级分类名称（含用户改名），二级仅保留计算机下的默认骨架。
     */
    resetFavCategoriesForClassify() {
        this.ensureExtendedFavTaxonomy();
        const data = getDbData();
        const computerL1 = data.categoryL1.find((item) => item.name === "计算机");
        if (!computerL1)
            return;
        data.categoryL2 = [];
        data.categoryL3 = [];
        data.favoriteItemMap = [];
        const defaultL2 = [
            "前端",
            "后端",
            "人工智能",
            "移动开发",
            "嵌入式",
            "硬核科技",
            "计算机网络",
            "数据库",
            "运维",
            "算法",
            "操作系统",
            "安全",
            "数据可视化",
            "游戏开发",
        ];
        for (let sortOrder = 0; sortOrder < defaultL2.length; sortOrder++) {
            data.categoryL2.push({
                id: nextId(data, "categoryL2"),
                categoryL1Id: computerL1.id,
                name: defaultL2[sortOrder],
                sortOrder,
            });
        }
        saveDb(data);
    }
    listL1() {
        return getDbData().categoryL1.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    createL1(name, icon = "folder") {
        const data = getDbData();
        const item = {
            id: nextId(data, "categoryL1"),
            name,
            icon,
            sortOrder: data.categoryL1.length,
        };
        data.categoryL1.push(item);
        saveDb(data);
        return item;
    }
    createL2(categoryL1Id, name) {
        const data = getDbData();
        const siblings = data.categoryL2.filter((c) => c.categoryL1Id === categoryL1Id);
        const item = {
            id: nextId(data, "categoryL2"),
            categoryL1Id,
            name,
            sortOrder: siblings.length,
        };
        data.categoryL2.push(item);
        saveDb(data);
        return item;
    }
    createL3(categoryL2Id, name) {
        const data = getDbData();
        const siblings = data.categoryL3.filter((c) => c.categoryL2Id === categoryL2Id);
        const item = {
            id: nextId(data, "categoryL3"),
            categoryL2Id,
            name,
            sortOrder: siblings.length,
        };
        data.categoryL3.push(item);
        saveDb(data);
        return item;
    }
    findL1ByName(name) {
        return this.listL1().find((item) => item.name === name);
    }
    findOrCreateL2(categoryL1Id, name) {
        const data = getDbData();
        const existing = data.categoryL2.find((item) => item.categoryL1Id === categoryL1Id && item.name === name);
        if (existing)
            return existing;
        return this.createL2(categoryL1Id, name);
    }
    findOrCreateL3(categoryL2Id, name) {
        const data = getDbData();
        const existing = data.categoryL3.find((item) => item.categoryL2Id === categoryL2Id && item.name === name);
        if (existing)
            return existing;
        return this.createL3(categoryL2Id, name);
    }
    updateCategoryName(level, id, name) {
        const data = getDbData();
        const trimmed = name.trim();
        if (!trimmed)
            return;
        if (level === "l1") {
            const item = data.categoryL1.find((c) => c.id === id);
            if (item)
                item.name = trimmed;
        }
        else if (level === "l2") {
            const item = data.categoryL2.find((c) => c.id === id);
            if (item)
                item.name = trimmed;
        }
        else {
            const item = data.categoryL3.find((c) => c.id === id);
            if (item)
                item.name = trimmed;
        }
        saveDb(data);
    }
    assignFavorite(input) {
        this.assignFavoritesBatch([input]);
    }
    assignFavoritesBatch(inputs) {
        if (inputs.length === 0)
            return;
        const data = getDbData();
        const replaceIds = new Set(inputs.map((item) => item.mediaId));
        data.favoriteItemMap = data.favoriteItemMap.filter((item) => !replaceIds.has(item.mediaId));
        for (const input of inputs) {
            data.favoriteItemMap.push({
                id: nextId(data, "favMap"),
                mediaId: input.mediaId,
                avid: input.avid,
                bvid: input.bvid ?? "",
                title: input.title ?? "",
                cover: input.cover ?? "",
                upperName: input.upperName ?? "",
                duration: input.duration ?? 0,
                categoryL1Id: input.categoryL1Id,
                categoryL2Id: input.categoryL2Id,
                categoryL3Id: input.categoryL3Id,
            });
        }
        saveDb(data);
    }
    createClassificationWriter() {
        const data = getDbData();
        const pendingL2 = [];
        const pendingL3 = [];
        const resolveL2ById = (categoryL2Id) => data.categoryL2.find((item) => item.id === categoryL2Id) ??
            pendingL2.find((item) => item.id === categoryL2Id);
        const findL2 = (categoryL1Id, name) => data.categoryL2.find((item) => item.categoryL1Id === categoryL1Id && item.name === name) ??
            pendingL2.find((item) => item.categoryL1Id === categoryL1Id && item.name === name);
        const findL3 = (categoryL2Id, name) => data.categoryL3.find((item) => item.categoryL2Id === categoryL2Id && item.name === name) ??
            pendingL3.find((item) => item.categoryL2Id === categoryL2Id && item.name === name);
        const findL3InL1 = (categoryL1Id, name) => {
            for (const l3 of [...data.categoryL3, ...pendingL3]) {
                const parent = resolveL2ById(l3.categoryL2Id);
                if (parent?.categoryL1Id === categoryL1Id && l3.name === name)
                    return l3;
            }
            return undefined;
        };
        return {
            findL1ByName: (name) => data.categoryL1.find((item) => item.name === name),
            findOrCreateL1: (name, icon = "folder") => {
                const existing = data.categoryL1.find((item) => item.name === name);
                if (existing)
                    return existing;
                const item = {
                    id: nextId(data, "categoryL1"),
                    name,
                    icon,
                    sortOrder: data.categoryL1.length,
                };
                data.categoryL1.push(item);
                return item;
            },
            findOrCreateL2: (categoryL1Id, name) => {
                const existing = findL2(categoryL1Id, name);
                if (existing)
                    return existing;
                const siblings = [
                    ...data.categoryL2.filter((item) => item.categoryL1Id === categoryL1Id),
                    ...pendingL2.filter((item) => item.categoryL1Id === categoryL1Id),
                ];
                const item = {
                    id: nextId(data, "categoryL2"),
                    categoryL1Id,
                    name,
                    sortOrder: siblings.length,
                };
                pendingL2.push(item);
                return item;
            },
            findOrCreateL3: (categoryL2Id, name) => {
                const existing = findL3(categoryL2Id, name);
                if (existing)
                    return existing;
                const parentL2 = resolveL2ById(categoryL2Id);
                if (parentL2) {
                    const sameInL1 = findL3InL1(parentL2.categoryL1Id, name);
                    if (sameInL1)
                        return sameInL1;
                }
                const siblings = [
                    ...data.categoryL3.filter((item) => item.categoryL2Id === categoryL2Id),
                    ...pendingL3.filter((item) => item.categoryL2Id === categoryL2Id),
                ];
                const item = {
                    id: nextId(data, "categoryL3"),
                    categoryL2Id,
                    name,
                    sortOrder: siblings.length,
                };
                pendingL3.push(item);
                return item;
            },
            commitAssignments: (assignments) => {
                if (pendingL2.length > 0)
                    data.categoryL2.push(...pendingL2);
                if (pendingL3.length > 0)
                    data.categoryL3.push(...pendingL3);
                const replaceIds = new Set(assignments.map((item) => item.mediaId));
                data.favoriteItemMap = data.favoriteItemMap.filter((item) => !replaceIds.has(item.mediaId));
                for (const input of assignments) {
                    data.favoriteItemMap.push({
                        id: nextId(data, "favMap"),
                        mediaId: input.mediaId,
                        avid: input.avid,
                        bvid: input.bvid,
                        title: input.title,
                        cover: input.cover ?? "",
                        upperName: input.upperName ?? "",
                        duration: input.duration ?? 0,
                        categoryL1Id: input.categoryL1Id,
                        categoryL2Id: input.categoryL2Id,
                        categoryL3Id: input.categoryL3Id,
                    });
                }
                saveDb(data);
                this.repairTaxonomy();
            },
        };
    }
    /** 全量分类跑完后删掉已经不在任何收藏夹里的旧映射 */
    pruneFavoriteAssignments(keepMediaIds) {
        const data = getDbData();
        const before = data.favoriteItemMap.length;
        data.favoriteItemMap = data.favoriteItemMap.filter((item) => keepMediaIds.has(item.mediaId));
        const removed = before - data.favoriteItemMap.length;
        if (removed > 0) {
            saveDb(data);
            this.repairTaxonomy();
        }
        return removed;
    }
    getFavoriteAssignments() {
        this.repairTaxonomy();
        return getDbData().favoriteItemMap;
    }
    repairTaxonomy() {
        const data = getDbData();
        let changed = false;
        const seenL2Ids = new Set();
        const dedupedL2 = [];
        for (const l2 of [...data.categoryL2].sort((a, b) => a.id - b.id)) {
            if (seenL2Ids.has(l2.id)) {
                changed = true;
                continue;
            }
            seenL2Ids.add(l2.id);
            dedupedL2.push(l2);
        }
        if (dedupedL2.length !== data.categoryL2.length) {
            data.categoryL2 = dedupedL2;
        }
        const remapL2 = new Map();
        const canonicalL2 = new Map();
        for (const l2 of [...data.categoryL2].sort((a, b) => a.id - b.id)) {
            const key = `${l2.categoryL1Id}:${l2.name}`;
            const existing = canonicalL2.get(key);
            if (existing == null) {
                canonicalL2.set(key, l2.id);
            }
            else {
                remapL2.set(l2.id, existing);
                changed = true;
            }
        }
        if (remapL2.size > 0) {
            for (const l3 of data.categoryL3) {
                const next = remapL2.get(l3.categoryL2Id);
                if (next != null) {
                    l3.categoryL2Id = next;
                    changed = true;
                }
            }
            for (const item of data.favoriteItemMap) {
                if (item.categoryL2Id != null) {
                    const next = remapL2.get(item.categoryL2Id);
                    if (next != null) {
                        item.categoryL2Id = next;
                        changed = true;
                    }
                }
            }
            data.categoryL2 = data.categoryL2.filter((l2) => !remapL2.has(l2.id));
        }
        const remapL3 = new Map();
        const canonicalL3 = new Map();
        for (const l3 of [...data.categoryL3].sort((a, b) => a.id - b.id)) {
            const key = `${l3.categoryL2Id}:${l3.name}`;
            const existing = canonicalL3.get(key);
            if (existing == null) {
                canonicalL3.set(key, l3.id);
            }
            else {
                remapL3.set(l3.id, existing);
                changed = true;
            }
        }
        if (remapL3.size > 0) {
            for (const item of data.favoriteItemMap) {
                if (item.categoryL3Id != null) {
                    const next = remapL3.get(item.categoryL3Id);
                    if (next != null) {
                        item.categoryL3Id = next;
                        changed = true;
                    }
                }
            }
            data.categoryL3 = data.categoryL3.filter((l3) => !remapL3.has(l3.id));
        }
        const l1ByL2 = new Map(data.categoryL2.map((l2) => [l2.id, l2.categoryL1Id]));
        const l3ByL1Name = new Map();
        for (const l3 of data.categoryL3) {
            const l1Id = l1ByL2.get(l3.categoryL2Id);
            if (l1Id == null)
                continue;
            const key = `${l1Id}:${l3.name}`;
            const bucket = l3ByL1Name.get(key) ?? [];
            bucket.push(l3);
            l3ByL1Name.set(key, bucket);
        }
        const crossL3Remap = new Map();
        for (const group of l3ByL1Name.values()) {
            if (group.length <= 1)
                continue;
            const ranked = group
                .map((l3) => ({
                l3,
                count: data.favoriteItemMap.filter((item) => item.categoryL3Id === l3.id).length,
            }))
                .sort((a, b) => b.count - a.count || a.l3.id - b.l3.id);
            const keep = ranked[0].l3;
            for (let index = 1; index < ranked.length; index++) {
                crossL3Remap.set(ranked[index].l3.id, keep.id);
                changed = true;
            }
        }
        if (crossL3Remap.size > 0) {
            for (const item of data.favoriteItemMap) {
                if (item.categoryL3Id == null)
                    continue;
                const next = crossL3Remap.get(item.categoryL3Id);
                if (next != null) {
                    item.categoryL3Id = next;
                }
            }
            data.categoryL3 = data.categoryL3.filter((l3) => !crossL3Remap.has(l3.id));
        }
        for (const item of data.favoriteItemMap) {
            if (item.categoryL3Id == null)
                continue;
            const l3 = data.categoryL3.find((c) => c.id === item.categoryL3Id);
            if (!l3) {
                item.categoryL3Id = null;
                changed = true;
                continue;
            }
            if (item.categoryL2Id !== l3.categoryL2Id) {
                item.categoryL2Id = l3.categoryL2Id;
                changed = true;
            }
            const l2 = data.categoryL2.find((c) => c.id === l3.categoryL2Id);
            if (l2 && item.categoryL1Id !== l2.categoryL1Id) {
                item.categoryL1Id = l2.categoryL1Id;
                changed = true;
            }
        }
        const referencedL3 = new Set(data.favoriteItemMap
            .map((item) => item.categoryL3Id)
            .filter((id) => id != null));
        const beforeL3 = data.categoryL3.length;
        data.categoryL3 = data.categoryL3.filter((l3) => referencedL3.has(l3.id));
        if (data.categoryL3.length !== beforeL3)
            changed = true;
        const referencedL2 = new Set([
            ...data.favoriteItemMap
                .map((item) => item.categoryL2Id)
                .filter((id) => id != null),
            ...data.categoryL3.map((l3) => l3.categoryL2Id),
        ]);
        const beforeL2 = data.categoryL2.length;
        data.categoryL2 = data.categoryL2.filter((l2) => referencedL2.has(l2.id));
        if (data.categoryL2.length !== beforeL2)
            changed = true;
        if (changed)
            saveDb(data);
    }
    enrichFavoriteCovers(briefs) {
        if (briefs.length === 0)
            return 0;
        const data = getDbData();
        const byBvid = new Map(briefs.map((item) => [item.bvid, item]));
        let updated = 0;
        for (const item of data.favoriteItemMap) {
            if (!item.bvid || item.cover)
                continue;
            const brief = byBvid.get(item.bvid);
            if (!brief?.cover)
                continue;
            item.cover = brief.cover;
            if (!item.upperName)
                item.upperName = brief.upperName;
            if (!item.duration)
                item.duration = brief.duration;
            updated++;
        }
        if (updated > 0)
            saveDb(data);
        return updated;
    }
    getMissingCoverBvids(limit = 80) {
        const seen = new Set();
        const result = [];
        for (const item of getDbData().favoriteItemMap) {
            if (!item.bvid || item.cover || seen.has(item.bvid))
                continue;
            seen.add(item.bvid);
            result.push(item.bvid);
            if (result.length >= limit)
                break;
        }
        return result;
    }
    getMissingCoverCount() {
        const seen = new Set();
        let count = 0;
        for (const item of getDbData().favoriteItemMap) {
            if (!item.bvid || item.cover || seen.has(item.bvid))
                continue;
            seen.add(item.bvid);
            count++;
        }
        return count;
    }
    getAssignmentByMediaId(mediaId) {
        return getDbData().favoriteItemMap.find((item) => item.mediaId === mediaId);
    }
    matchesLocalCategory(mediaId, selection) {
        if (selection.level === "all")
            return true;
        const assignment = this.getAssignmentByMediaId(mediaId);
        if (selection.level === "uncategorized") {
            return (!assignment ||
                (!assignment.categoryL1Id &&
                    !assignment.categoryL2Id &&
                    !assignment.categoryL3Id));
        }
        if (!assignment)
            return false;
        const data = getDbData();
        if (selection.level === "l3" && selection.id != null) {
            return assignment.categoryL3Id === selection.id;
        }
        if (selection.level === "l2" && selection.id != null) {
            if (assignment.categoryL2Id === selection.id)
                return true;
            const l3Ids = data.categoryL3
                .filter((c) => c.categoryL2Id === selection.id)
                .map((c) => c.id);
            return (assignment.categoryL3Id != null &&
                l3Ids.includes(assignment.categoryL3Id));
        }
        if (selection.level === "l1" && selection.id != null) {
            if (assignment.categoryL1Id === selection.id)
                return true;
            const l2Ids = data.categoryL2
                .filter((c) => c.categoryL1Id === selection.id)
                .map((c) => c.id);
            if (assignment.categoryL2Id != null &&
                l2Ids.includes(assignment.categoryL2Id))
                return true;
            if (assignment.categoryL3Id != null) {
                const l3 = data.categoryL3.find((c) => c.id === assignment.categoryL3Id);
                if (l3 && l2Ids.includes(l3.categoryL2Id))
                    return true;
            }
        }
        return false;
    }
    getTree() {
        this.repairTaxonomy();
        const data = getDbData();
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
                    .map((l3) => ({
                    id: l3.id,
                    name: l3.name,
                    sortOrder: l3.sortOrder,
                })),
            })),
        }));
    }
    getCategoryCounts() {
        const counts = { all: 0, uncategorized: 0 };
        const data = getDbData();
        const assignedIds = new Set();
        for (const item of data.favoriteItemMap) {
            assignedIds.add(item.mediaId);
            counts.all++;
            if (item.categoryL1Id)
                counts[`l1:${item.categoryL1Id}`] =
                    (counts[`l1:${item.categoryL1Id}`] ?? 0) + 1;
            if (item.categoryL2Id)
                counts[`l2:${item.categoryL2Id}`] =
                    (counts[`l2:${item.categoryL2Id}`] ?? 0) + 1;
            if (item.categoryL3Id)
                counts[`l3:${item.categoryL3Id}`] =
                    (counts[`l3:${item.categoryL3Id}`] ?? 0) + 1;
        }
        counts.uncategorized = counts.all;
        return counts;
    }
    getUpGroups() {
        const data = getDbData();
        return data.upGroups
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((group) => ({
            id: group.id,
            name: group.name,
            color: group.color,
            isAiGenerated: group.isAiGenerated,
            sortOrder: group.sortOrder,
            parentId: group.parentId,
            memberCount: data.upMemberMap.filter((member) => member.upGroupId === group.id).length,
        }));
    }
    /** 删掉没有成员的自动分组（手动建的保留），一级下没子分组也一并删 */
    pruneEmptyAiUpGroups() {
        const data = getDbData();
        const used = new Set(data.upMemberMap.map((member) => member.upGroupId));
        data.upGroups = data.upGroups.filter((group) => group.parentId === null || !group.isAiGenerated || used.has(group.id));
        const parents = new Set(data.upGroups.map((group) => group.parentId));
        data.upGroups = data.upGroups.filter((group) => group.parentId !== null ||
            group.name === "未分组" ||
            !group.isAiGenerated ||
            parents.has(group.id));
        saveDb(data);
    }
    getUpGroupTree() {
        const data = getDbData();
        return data.upGroups
            .filter((group) => group.parentId === null && group.name !== "未分组")
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((l1) => {
            const children = data.upGroups
                .filter((group) => group.parentId === l1.id)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((l2) => ({
                id: l2.id,
                name: l2.name,
                color: l2.color,
                sortOrder: l2.sortOrder,
                count: data.upMemberMap.filter((member) => member.upGroupId === l2.id).length,
            }));
            return {
                id: l1.id,
                name: l1.name,
                color: l1.color,
                sortOrder: l1.sortOrder,
                count: children.reduce((sum, child) => sum + child.count, 0),
                children,
            };
        });
    }
    getUpGroupMemberMids(selection) {
        const data = getDbData();
        const members = data.upMemberMap;
        if (selection.level === "all") {
            return members.map((member) => member.mid);
        }
        if (selection.level === "l2" && selection.id != null) {
            return members
                .filter((member) => member.upGroupId === selection.id)
                .map((member) => member.mid);
        }
        if (selection.level === "l1" && selection.id != null) {
            const childIds = new Set(data.upGroups
                .filter((group) => group.parentId === selection.id)
                .map((group) => group.id));
            return members
                .filter((member) => childIds.has(member.upGroupId))
                .map((member) => member.mid);
        }
        return [];
    }
    createUpClassificationWriter() {
        const data = getDbData();
        const persist = () => saveDb(data);
        return {
            findOrCreateL1(name) {
                const existing = data.upGroups.find((group) => group.parentId === null &&
                    upGroupMatches(group, name) &&
                    group.name !== "未分组");
                if (existing)
                    return existing;
                const item = {
                    id: nextId(data, "upGroup"),
                    name,
                    color: UP_L1_COLORS[name] ?? "#64748b",
                    isAiGenerated: true,
                    sortOrder: data.upGroups.filter((group) => group.parentId === null)
                        .length,
                    parentId: null,
                };
                data.upGroups.push(item);
                persist();
                return item;
            },
            findOrCreateL2(l1Id, name) {
                const existing = data.upGroups.find((group) => group.parentId === l1Id && upGroupMatches(group, name));
                if (existing)
                    return existing;
                const parent = data.upGroups.find((group) => group.id === l1Id);
                const item = {
                    id: nextId(data, "upGroup"),
                    name,
                    color: parent?.color ?? "#64748b",
                    isAiGenerated: true,
                    sortOrder: data.upGroups.filter((group) => group.parentId === l1Id)
                        .length,
                    parentId: l1Id,
                };
                data.upGroups.push(item);
                persist();
                return item;
            },
        };
    }
    resolveUpGroupId(l1Name, l2Name) {
        const writer = this.createUpClassificationWriter();
        const l1 = writer.findOrCreateL1(l1Name);
        const l2 = writer.findOrCreateL2(l1.id, l2Name);
        return l2.id;
    }
    getUpLeafGroups() {
        const data = getDbData();
        const l1Map = new Map(data.upGroups
            .filter((group) => group.parentId === null && group.name !== "未分组")
            .map((group) => [group.id, group.name]));
        return data.upGroups
            .filter((group) => group.parentId != null)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((group) => ({
            id: group.id,
            path: `${l1Map.get(group.parentId) ?? "其他"} / ${group.name}`,
        }));
    }
    /** 现有 UP 分组结果，按 AI/规则原名给出一级 / 二级（改过名的也能找回原分组） */
    getUpAssignmentPaths() {
        const data = getDbData();
        const byId = new Map(data.upGroups.map((group) => [group.id, group]));
        const out = [];
        for (const member of data.upMemberMap) {
            const group = byId.get(member.upGroupId);
            if (!group || group.parentId == null)
                continue;
            const parent = byId.get(group.parentId);
            if (!parent)
                continue;
            out.push({
                mid: member.mid,
                l1: parent.name,
                l2: group.name,
                l1Id: parent.id,
                l2Id: group.id,
                source: member.source,
                confidence: member.confidence,
            });
        }
        return out;
    }
    /** 要同步到 B 站的分组：二级分组，以及没有子分组但直接挂了 UP 的一级分组 */
    getUpSyncLeaves() {
        const data = getDbData();
        const midsByGroup = new Map();
        for (const member of data.upMemberMap) {
            const list = midsByGroup.get(member.upGroupId) ?? [];
            list.push(member.mid);
            midsByGroup.set(member.upGroupId, list);
        }
        const roots = data.upGroups
            .filter((group) => group.parentId === null && group.name !== "未分组")
            .sort((a, b) => a.sortOrder - b.sortOrder);
        const leaves = [];
        for (const l1 of roots) {
            const children = data.upGroups
                .filter((group) => group.parentId === l1.id)
                .sort((a, b) => a.sortOrder - b.sortOrder);
            if (children.length === 0) {
                const mids = midsByGroup.get(l1.id) ?? [];
                if (mids.length > 0) {
                    leaves.push({ groupId: l1.id, l1Name: l1.name, l2Name: null, mids });
                }
                continue;
            }
            for (const l2 of children) {
                const mids = midsByGroup.get(l2.id) ?? [];
                if (mids.length > 0) {
                    leaves.push({
                        groupId: l2.id,
                        l1Name: l1.name,
                        l2Name: l2.name,
                        mids,
                    });
                }
            }
        }
        return leaves;
    }
    renameUpGroup(id, name) {
        const next = name.trim();
        if (!next)
            throw new Error("分组名不能为空");
        if (next === "未分组")
            throw new Error("不能用「未分组」作为名字");
        const data = getDbData();
        const group = data.upGroups.find((item) => item.id === id);
        if (!group)
            throw new Error("分组不存在");
        if (group.name === next)
            return;
        const clash = data.upGroups.some((item) => item.id !== id &&
            item.parentId === group.parentId &&
            item.name === next);
        if (clash)
            throw new Error("同级已有同名分组");
        if (group.isAiGenerated && !group.sourceName)
            group.sourceName = group.name;
        group.name = next;
        saveDb(data);
    }
    /** ids 是同一父级下的分组，按传入顺序重排 */
    reorderUpGroups(ids) {
        const data = getDbData();
        const byId = new Map(data.upGroups.map((group) => [group.id, group]));
        ids.forEach((id, index) => {
            const group = byId.get(id);
            if (group)
                group.sortOrder = index;
        });
        saveDb(data);
    }
    createUpGroup(name, color = "#FB7299") {
        const data = getDbData();
        const item = {
            id: nextId(data, "upGroup"),
            name,
            color,
            isAiGenerated: false,
            sortOrder: data.upGroups.length,
            parentId: null,
        };
        data.upGroups.push(item);
        saveDb(data);
        return { ...item, memberCount: 0 };
    }
    createTask(type) {
        const data = getDbData();
        const task = {
            id: nextId(data, "task"),
            type,
            status: "pending",
            progress: 0,
            message: "等待执行",
        };
        data.classificationTasks.push(task);
        saveDb(data);
        return task;
    }
    updateTask(id, patch) {
        const data = getDbData();
        const task = data.classificationTasks.find((t) => t.id === id);
        if (task)
            Object.assign(task, patch);
        saveDb(data);
    }
    getTask(id) {
        return getDbData().classificationTasks.find((t) => t.id === id) ?? null;
    }
    assignUp(mid, groupId, source, confidence) {
        this.assignUpsBatch([{ mid, groupId, source, confidence }]);
    }
    assignUpsBatch(entries) {
        if (entries.length === 0)
            return;
        const data = getDbData();
        const replaceMids = new Set(entries.map((entry) => entry.mid));
        data.upMemberMap = data.upMemberMap.filter((member) => !replaceMids.has(member.mid));
        for (const entry of entries) {
            data.upMemberMap.push({
                id: nextId(data, "member"),
                mid: entry.mid,
                upGroupId: entry.groupId,
                source: entry.source,
                confidence: entry.confidence,
            });
        }
        saveDb(data);
    }
    replaceAllUpMembers(entries) {
        const data = getDbData();
        data.upMemberMap = entries.map((entry) => ({
            id: nextId(data, "member"),
            mid: entry.mid,
            upGroupId: entry.groupId,
            source: entry.source,
            confidence: entry.confidence,
        }));
        saveDb(data);
    }
}
export const taxonomyRepo = new TaxonomyRepository();
export function initDb() {
    getDbData();
}
