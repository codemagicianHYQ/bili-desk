import type {
  CategoryTreeNode,
  LocalCategorySelection,
  ToViewItem,
} from "@shared/types";

export interface CategoryPath {
  l1: string;
  l2?: string;
  l3?: string;
}

interface NodeIds {
  l1: number;
  l2: number | null;
  l3: number | null;
}

export const OTHER_CATEGORY = "其他";

/** 删视频后树会重建，按路径固定 id，选中的分类才不会跳到别的节点 */
const pathIds = new Map<string, number>();
function idFor(key: string): number {
  let id = pathIds.get(key);
  if (id == null) {
    id = pathIds.size + 1;
    pathIds.set(key, id);
  }
  return id;
}

/** 只在本页内用的临时树，不进本地分类库 */
export function buildWatchLaterTree(
  videos: ToViewItem[],
  paths: Map<string, CategoryPath>,
): { tree: CategoryTreeNode[]; idsByBvid: Map<string, NodeIds> } {
  const tree: CategoryTreeNode[] = [];
  const idsByBvid = new Map<string, NodeIds>();

  for (const video of videos) {
    const path = paths.get(video.bvid) ?? { l1: OTHER_CATEGORY };

    let l1 = tree.find((node) => node.name === path.l1);
    if (!l1) {
      l1 = { id: idFor(path.l1), name: path.l1, icon: "", sortOrder: 0, count: 0, children: [] };
      tree.push(l1);
    }
    l1.count = (l1.count ?? 0) + 1;

    let l2Id: number | null = null;
    let l3Id: number | null = null;
    if (path.l2) {
      let l2 = l1.children.find((node) => node.name === path.l2);
      if (!l2) {
        l2 = { id: idFor(`${path.l1}/${path.l2}`), name: path.l2, sortOrder: 0, count: 0, children: [] };
        l1.children.push(l2);
      }
      l2.count = (l2.count ?? 0) + 1;
      l2Id = l2.id;
      if (path.l3) {
        let l3 = l2.children.find((node) => node.name === path.l3);
        if (!l3) {
          l3 = { id: idFor(`${path.l1}/${path.l2}/${path.l3}`), name: path.l3, sortOrder: 0, count: 0 };
          l2.children.push(l3);
        }
        l3.count = (l3.count ?? 0) + 1;
        l3Id = l3.id;
      }
    }
    idsByBvid.set(video.bvid, { l1: l1.id, l2: l2Id, l3: l3Id });
  }

  const byCount = (a: { count?: number }, b: { count?: number }) =>
    (b.count ?? 0) - (a.count ?? 0);
  tree.sort((a, b) => {
    if (a.name === OTHER_CATEGORY) return 1;
    if (b.name === OTHER_CATEGORY) return -1;
    return byCount(a, b);
  });
  for (const l1 of tree) {
    l1.children.sort(byCount);
    for (const l2 of l1.children) l2.children.sort(byCount);
  }

  return { tree, idsByBvid };
}

export function filterBySelection(
  videos: ToViewItem[],
  idsByBvid: Map<string, NodeIds>,
  selection: LocalCategorySelection,
): ToViewItem[] {
  if (selection.level === "all" || selection.id == null) return videos;
  const level = selection.level;
  if (level !== "l1" && level !== "l2" && level !== "l3") return videos;
  return videos.filter((video) => idsByBvid.get(video.bvid)?.[level] === selection.id);
}
