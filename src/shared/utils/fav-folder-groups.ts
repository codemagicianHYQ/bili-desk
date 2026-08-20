import type { FavFolder } from "../types";

const KNOWN_L1 = new Set(["计算机", "学习", "娱乐", "生活", "AI", "其他"]);
const L1_DISPLAY_ORDER = ["计算机", "学习", "AI", "生活", "娱乐", "其他"];

/** 侧栏未识别夹的分组名；不是官方收藏夹 */
export const UNGROUPED_L1 = "未分组";
/** 用户把夹拖出一级目录后，不再按名字自动归组 */
export const FLAT_GROUP_OVERRIDE = "__flat__";
export type FavFolderGroupOverrides = Record<string, string>;

const DEFAULT_TITLES = new Set(["默认收藏夹", "default"]);

type FolderRule = {
  l1: string;
  l2: string;
  l3?: string;
  keys: string[];
};

/** 用收藏夹自己的名字推断侧栏分组（不改官方结构） */
const FOLDER_NAME_RULES: FolderRule[] = [
  {
    l1: "计算机",
    l2: "测试",
    keys: ["测试", "单元测试", "集成测试", "自动化测试"],
  },
  { l1: "计算机", l2: "Java", keys: ["java", "spring", "jvm", "maven"] },
  {
    l1: "计算机",
    l2: "前端",
    keys: [
      "前端",
      "vue",
      "react",
      "javascript",
      "typescript",
      "html",
      "css",
      "小程序",
    ],
  },
  {
    l1: "计算机",
    l2: "后端",
    keys: ["后端", "golang", "go语言", "nodejs", "nestjs", "django", "laravel"],
  },
  { l1: "计算机", l2: "Python", keys: ["python"] },
  {
    l1: "计算机",
    l2: "移动开发",
    keys: [
      "移动开发",
      "android",
      "安卓",
      "flutter",
      "react native",
      "ios开发",
      "鸿蒙",
    ],
  },
  { l1: "计算机", l2: "算法", keys: ["算法", "数据结构", "leetcode", "力扣"] },
  { l1: "计算机", l2: "安全", keys: ["安全", "渗透", "网络安全"] },
  {
    l1: "计算机",
    l2: "数据库",
    keys: ["数据库", "mysql", "redis", "mongodb", "sql"],
  },
  { l1: "计算机", l2: "操作系统", keys: ["操作系统", "linux"] },
  { l1: "计算机", l2: "计算机网络", keys: ["计算机网络", "tcp", "http协议"] },
  {
    l1: "计算机",
    l2: "运维",
    keys: ["运维", "docker", "kubernetes", "k8s", "devops"],
  },
  { l1: "计算机", l2: "嵌入式", keys: ["嵌入式", "单片机", "stm32", "fpga"] },
  { l1: "计算机", l2: "半导体", keys: ["半导体", "芯片", "集成电路", "晶圆"] },
  { l1: "计算机", l2: "web3", keys: ["web3", "区块链", "以太坊", "ethereum"] },
  {
    l1: "计算机",
    l2: "建模",
    keys: ["建模", "blender", "maya", "三维", "3d模型"],
  },
  {
    l1: "计算机",
    l2: "游戏开发",
    keys: ["游戏开发", "unity", "unreal", "ue5"],
  },
  { l1: "计算机", l2: "数据可视化", keys: ["可视化", "echarts"] },
  { l1: "计算机", l2: "硬核科技", keys: ["硬核科技", "硬核"] },
  {
    l1: "计算机",
    l2: "量化",
    keys: ["量化", "quant", "量化交易", "量化投资"],
  },
  {
    l1: "计算机",
    l2: "逆向",
    keys: ["逆向", "反编译", "逆向工程", "二进制"],
  },
  {
    l1: "计算机",
    l2: "爬虫",
    keys: ["爬虫", "scrapy", "crawler", "spider"],
  },
  { l1: "计算机", l2: "综合", keys: ["计算机"] },

  {
    l1: "学习",
    l2: "面试",
    keys: ["面试", "实习", "秋招", "春招", "求职", "offer"],
  },
  {
    l1: "学习",
    l2: "数学",
    keys: ["数学", "高数", "线代", "微积分", "概率论"],
  },
  { l1: "学习", l2: "考研", keys: ["考研", "408", "肖秀荣"] },
  {
    l1: "学习",
    l2: "外语",
    keys: ["外语", "英语", "日语", "雅思", "托福", "四六级"],
  },
  { l1: "学习", l2: "课程", keys: ["课程", "网课", "公开课"] },

  { l1: "娱乐", l2: "游戏", keys: ["游戏", "电竞"] },
  { l1: "娱乐", l2: "影视", keys: ["影视", "电影", "剧集", "动漫"] },
  { l1: "娱乐", l2: "音乐", keys: ["音乐", "歌曲"] },

  { l1: "生活", l2: "健身", keys: ["健身", "运动", "减肥"] },
  { l1: "生活", l2: "数码", keys: ["数码", "手机评测", "相机"] },
  { l1: "生活", l2: "美食", keys: ["美食", "做饭", "烘焙"] },
  { l1: "生活", l2: "旅游", keys: ["旅游", "出行"] },
  { l1: "生活", l2: "家居", keys: ["家居", "装修", "户型"] },
  { l1: "生活", l2: "财经", keys: ["财经", "理财", "基金"] },
  { l1: "生活", l2: "科普", keys: ["科普"] },
  { l1: "生活", l2: "社会人文", keys: ["社会", "人文", "哲学", "历史"] },
];

export function parseFavFolderPath(title: string): {
  parts: string[];
  overflow: number | null;
} {
  const trimmed = title.trim();
  const overflowMatch = trimmed.match(/^(.*)-(\d+)$/);
  const overflow = overflowMatch ? Number(overflowMatch[2]) : null;
  const base = (overflowMatch?.[1] ?? trimmed).trim();
  const parts = base
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    parts: parts.length > 0 ? parts : [trimmed || title],
    overflow,
  };
}

function normalizeFolderName(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-·/|,，]+/g, " ")
    .trim();
}

function compactFolderName(title: string): string {
  return normalizeFolderName(title).replace(/\s+/g, "");
}

function isDefaultFolderTitle(title: string): boolean {
  return DEFAULT_TITLES.has(title.trim().toLowerCase());
}

function isDumpFolderTitle(title: string): boolean {
  return /^其他(-\d+)?$/.test(title.trim());
}

function stripAiPrefix(compact: string): string {
  return compact.replace(/^ai/, "").replace(/^人工智能/, "");
}

function inferAiLeaf(title: string): string {
  const compact = compactFolderName(title);
  const rest = stripAiPrefix(compact);
  if (/机器学习/.test(compact)) return "机器学习";
  if (/深度学习/.test(compact)) return "深度学习";
  if (/skill/.test(compact) || rest === "技能") return "skills";
  if (/项目|project|实战/.test(compact)) return "项目";
  if (/编程|coding|写代码/.test(compact)) return "编程";
  if (/学习|入门|教程|课程/.test(compact)) return "学习";
  if (/agent|智能体|\bmcp\b/.test(normalizeFolderName(title))) return "Agent";
  if (/画|绘画|midjourney|diffusion/.test(compact)) return "绘画";
  if (rest.length >= 2) return title.replace(/^\s*ai\s*/i, "").trim() || "综合";
  return "综合";
}

/** 短中文词不要误伤「逆向思维」「正能量」这类生活用语 */
const SHORT_ZH_FALSE_FRIENDS = /思维|操作|淘汰|选择|宽松|正能量/;

/** 整词匹配的编程语言，避免 go/c 这种短词乱撞 */
const CS_LANG_WORDS = [
  "rust",
  "kotlin",
  "swift",
  "scala",
  "haskell",
  "ruby",
  "php",
  "dart",
  "julia",
  "matlab",
  "lua",
  "perl",
  "erlang",
  "elixir",
  "zig",
  "nim",
  "ocaml",
  "fortran",
  "solidity",
  "groovy",
  "clojure",
  "csharp",
  "cpp",
  "golang",
  "nodejs",
  "wasm",
  "webassembly",
];

const CS_LANG_EXACT = new Set(["go", "rust", "c++", "c#", "r", "qt"]);

const COURSE_RE =
  /opencourse|open\s*course|\bmooc\b|\blecture\b|\bcourses?\b|coursera|\bedx\b|udemy|stanford|harvard|berkeley|cambridge|oxford|\bmit\b|公开课|网课|慕课|讲座|名校/;

const SCIENCE_RE =
  /脑科学|神经科学|认知科学|心理学|物理学|化学|生物学|天文学|地理学|医学|材料学|量子|核能|新能源|能源|脑机/;

/**
 * 夹名里常见但没写成「计算机-xxx」的技术词。
 * 命中后仍用原夹名当叶子，避免再造一套死板二级名。
 */
const FLEX_TOPIC_BAGS: Array<{ l1: string; keys: string[] }> = [
  {
    l1: "AI",
    keys: [
      "机器学习",
      "深度学习",
      "神经网络",
      "pytorch",
      "tensorflow",
      "大模型",
      "llm",
      "aigc",
      "transformer",
      "强化学习",
      "计算机视觉",
      "nlp",
      "生成式",
    ],
  },
  {
    l1: "计算机",
    keys: [
      "量化",
      "quant",
      "逆向",
      "反编译",
      "爬虫",
      "scrapy",
      "crawler",
      "黑客",
      "漏洞",
      "ctf",
      "pwn",
      "汇编",
      "内核",
      "编译原理",
      "二进制",
      "抓包",
      "大数据",
      "hadoop",
      "spark",
      "flink",
      "云计算",
      "微服务",
      "分布式",
      "图形学",
      "opengl",
      "vulkan",
      "驱动开发",
      "软件工程",
      "架构",
    ],
  },
  {
    l1: "学习",
    keys: [
      "脑科学",
      "神经科学",
      "认知科学",
      "心理学",
      "物理学",
      "化学",
      "生物学",
      "天文学",
      "能源",
      "能量",
      "量子",
      "stanford",
      "opencourse",
      "mooc",
      "公开课",
    ],
  },
  {
    l1: "生活",
    keys: [
      "house",
      "dreamhouse",
      "interior",
      "furniture",
      "别墅",
      "室内",
      "房子",
      "家居",
      "装修",
      "户型",
      "宠物",
      "汽车",
      "摄影",
      "穿搭",
      "护肤",
      "美妆",
      "母婴",
      "育儿",
      "瑜伽",
      "yoga",
    ],
  },
  {
    l1: "娱乐",
    keys: [
      "超自然",
      "灵异",
      "未解之谜",
      "ufo",
      "鬼故事",
      "玄学",
      "奇闻",
      "综艺",
      "舞蹈",
      "番剧",
      "漫画",
      "鬼畜",
    ],
  },
];

const HOME_RE =
  /dreamhouse|dream\s*house|interior|furniture|villa|家居|装修|户型|别墅|室内设计|房子/;
const LIFE_RE =
  /宠物|汽车|车评|摄影|穿搭|护肤|美妆|母婴|育儿|瑜伽|\byoga\b|\bfitness\b|减肥/;
const ENTERTAIN_RE = /综艺|舞蹈|番剧|漫画|鬼畜|沙雕|整活/;

function nameHits(norm: string, compact: string, key: string): boolean {
  const needle = key.toLowerCase();
  const compactNeedle = needle.replace(/\s+/g, "");
  if (!compactNeedle) return false;
  if (/^[a-z0-9]+$/.test(compactNeedle) && compactNeedle.length <= 4) {
    const pattern = new RegExp(
      `(?:^|[^a-z0-9])${compactNeedle}(?:[^a-z0-9]|$)`,
    );
    return pattern.test(compact) || pattern.test(norm);
  }
  return compact.includes(compactNeedle) || norm.includes(needle);
}

function looksLikeAiFolder(title: string): boolean {
  const norm = normalizeFolderName(title);
  const compact = compactFolderName(title);
  if (
    /人工智能|大模型|\bllm\b|chatgpt|智能体|机器学习|深度学习|神经网络|pytorch|tensorflow|aigc|强化学习/.test(
      norm,
    )
  ) {
    return true;
  }
  if (/^ai(\s|$)/.test(norm) || compact.startsWith("ai")) return true;
  return /(^|[\s_\-])ai([\s_\-]|$)/.test(` ${norm} `);
}

function flexTopicHit(compact: string, key: string): boolean {
  const needle = key.toLowerCase().replace(/\s+/g, "");
  if (!needle) return false;
  if (compact === needle) return true;
  if (needle.length <= 2 && SHORT_ZH_FALSE_FRIENDS.test(compact)) {
    return false;
  }
  if (compact.includes(needle) && compact.length <= needle.length + 6) {
    return true;
  }
  return needle.length >= 3 && compact.includes(needle);
}

function hasLangToken(norm: string, compact: string, lang: string): boolean {
  if (compact === lang || compact === `${lang}lang`) return true;
  const escaped = lang.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`);
  return pattern.test(norm) || pattern.test(compact);
}

function inferByBroadPattern(
  title: string,
  norm: string,
  compact: string,
  leaf: string,
): { l1: string; l2: string } | null {
  if (CS_LANG_EXACT.has(compact)) {
    return { l1: "计算机", l2: leaf };
  }
  if (CS_LANG_WORDS.some((lang) => hasLangToken(norm, compact, lang))) {
    return { l1: "计算机", l2: leaf };
  }
  if (COURSE_RE.test(norm) || COURSE_RE.test(compact)) {
    return { l1: "学习", l2: leaf };
  }
  if (SCIENCE_RE.test(compact) || compact === "能量") {
    return { l1: "学习", l2: leaf };
  }
  if (HOME_RE.test(norm) || HOME_RE.test(compact)) {
    return { l1: "生活", l2: leaf };
  }
  if (LIFE_RE.test(norm) || LIFE_RE.test(compact)) {
    return { l1: "生活", l2: leaf };
  }
  if (ENTERTAIN_RE.test(compact)) {
    return { l1: "娱乐", l2: leaf };
  }
  return null;
}

function inferFlexFolderGroup(
  title: string,
): { l1: string; l2: string } | null {
  const compact = compactFolderName(title);
  const norm = normalizeFolderName(title);
  const parts = parseFavFolderPath(title).parts;
  const leaf = parts[parts.length - 1] || title.trim();

  const patterned = inferByBroadPattern(title, norm, compact, leaf);
  if (patterned) return patterned;

  for (const bag of FLEX_TOPIC_BAGS) {
    if (bag.keys.some((key) => flexTopicHit(compact, key))) {
      return { l1: bag.l1, l2: leaf };
    }
  }
  return null;
}

export function inferFavFolderGroup(title: string): {
  l1: string;
  l2: string;
  l3?: string;
} | null {
  if (isDefaultFolderTitle(title)) return null;
  if (isDumpFolderTitle(title)) {
    const { overflow } = parseFavFolderPath(title);
    return { l1: "其他", l2: overflow != null ? `其他-${overflow}` : "其他" };
  }

  const parsed = parseFavFolderPath(title);
  if (parsed.parts.length >= 2 && KNOWN_L1.has(parsed.parts[0])) {
    return {
      l1: parsed.parts[0],
      l2: parsed.parts[1],
      l3: parsed.parts[2],
    };
  }

  if (looksLikeAiFolder(title)) {
    return { l1: "AI", l2: inferAiLeaf(title) };
  }

  const compact = compactFolderName(title);
  const norm = normalizeFolderName(title);

  for (const rule of FOLDER_NAME_RULES) {
    const hit = rule.keys.some((key) => {
      if (key.length <= 2 && !/[a-z0-9]/i.test(key)) {
        return flexTopicHit(compact, key);
      }
      return nameHits(norm, compact, key);
    });
    if (hit) {
      return { l1: rule.l1, l2: rule.l2, l3: rule.l3 };
    }
  }

  const flex = inferFlexFolderGroup(title);
  if (flex) return flex;

  if (parsed.parts.length >= 2) {
    return {
      l1: parsed.parts[0],
      l2: parsed.parts[1],
      l3: parsed.parts[2],
    };
  }

  return null;
}

export function favFolderLeafLabel(title: string): string {
  const inferred = inferFavFolderGroup(title);
  if (inferred?.l3) return inferred.l3;
  if (inferred?.l2) return inferred.l2;
  return title;
}

type DescribedFolder = {
  folder: FavFolder;
  l1: string | null;
  l2: string;
  l3?: string;
  label: string;
};

function describeFolder(
  folder: FavFolder,
  overrides: FavFolderGroupOverrides = {},
): DescribedFolder {
  const override = overrides[String(folder.id)];
  if (override === FLAT_GROUP_OVERRIDE) {
    return {
      folder,
      l1: null,
      l2: folder.title,
      label: folder.title,
    };
  }
  if (override && override !== UNGROUPED_L1) {
    return {
      folder,
      l1: override,
      l2: folder.title,
      label: folder.title,
    };
  }

  const inferred = inferFavFolderGroup(folder.title);
  if (!inferred) {
    return {
      folder,
      l1: null,
      l2: folder.title,
      label: folder.title,
    };
  }
  return {
    folder,
    l1: inferred.l1,
    l2: inferred.l2,
    l3: inferred.l3,
    label: inferred.l3 ?? inferred.l2,
  };
}

function l1DisplayRank(name: string): number {
  const index = L1_DISPLAY_ORDER.indexOf(name);
  return index >= 0 ? index : L1_DISPLAY_ORDER.length + 1;
}

function uniqueLabels(members: DescribedFolder[]): DescribedFolder[] {
  const counts = new Map<string, number>();
  for (const item of members) {
    const key = `${item.l2}::${item.l3 ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return members.map((item) => {
    const key = `${item.l2}::${item.l3 ?? ""}`;
    if ((counts.get(key) ?? 0) <= 1) return item;
    return { ...item, label: item.folder.title };
  });
}

export type FolderNavItem = {
  folder: FavFolder;
  label: string;
};

export type FolderNavL2 = {
  kind: "l2";
  name: string;
  folders: FolderNavItem[];
};

export type FolderNavL1 = {
  kind: "l1";
  name: string;
  totalCount: number;
  items: Array<FolderNavItem | FolderNavL2>;
};

export type FolderNavOverflow = {
  kind: "overflow";
  folders: FolderNavItem[];
};

export type FolderNavFlat = {
  kind: "flat";
  folder: FavFolder;
  label: string;
};

export type FolderNavUngrouped = {
  kind: "ungrouped";
  folders: FolderNavItem[];
};

export type FolderNavBlock =
  | FolderNavL1
  | FolderNavOverflow
  | FolderNavFlat
  | FolderNavUngrouped;

function isL2Item(item: FolderNavItem | FolderNavL2): item is FolderNavL2 {
  return "kind" in item && item.kind === "l2";
}

function buildL1Block(name: string, members: DescribedFolder[]): FolderNavL1 {
  const labeled = uniqueLabels(members);
  const items: Array<FolderNavItem | FolderNavL2> = [];
  const visited = new Set<number>();

  for (const item of labeled) {
    if (visited.has(item.folder.id)) continue;
    const l2Members = labeled.filter((entry) => entry.l2 === item.l2);
    for (const entry of l2Members) visited.add(entry.folder.id);

    const hasL3 = l2Members.some((entry) => Boolean(entry.l3));
    if (hasL3 && l2Members.length > 1) {
      items.push({
        kind: "l2",
        name: item.l2,
        folders: l2Members.map((entry) => ({
          folder: entry.folder,
          label: entry.label,
        })),
      });
      continue;
    }
    if (hasL3 && l2Members.length === 1) {
      const only = l2Members[0];
      items.push({
        folder: only.folder,
        label: only.l3 ? `${only.l2} / ${only.label}` : only.label,
      });
      continue;
    }

    for (const entry of l2Members) {
      items.push({ folder: entry.folder, label: entry.label });
    }
  }

  return {
    kind: "l1",
    name,
    totalCount: members.reduce((sum, item) => sum + item.folder.mediaCount, 0),
    items,
  };
}

export function flattenFolderNavBlock(block: FolderNavBlock): FavFolder[] {
  if (block.kind === "flat") return [block.folder];
  if (block.kind === "overflow" || block.kind === "ungrouped") {
    return block.folders.map((item) => item.folder);
  }
  const folders: FavFolder[] = [];
  for (const item of block.items) {
    if (isL2Item(item)) {
      folders.push(...item.folders.map((entry) => entry.folder));
    } else {
      folders.push(item.folder);
    }
  }
  return folders;
}

export function groupFavFolders(
  folders: FavFolder[],
  overrides: FavFolderGroupOverrides = {},
): {
  pinned: FavFolder[];
  blocks: FolderNavBlock[];
} {
  const pinned = folders.filter(
    (folder) => folder.isDefault || isDefaultFolderTitle(folder.title),
  );
  const rest = folders.filter(
    (folder) => !folder.isDefault && !isDefaultFolderTitle(folder.title),
  );
  const described = rest.map((folder) => describeFolder(folder, overrides));
  const byL1 = new Map<string, DescribedFolder[]>();
  const flats: DescribedFolder[] = [];

  for (const item of described) {
    if (!item.l1 || item.l1 === UNGROUPED_L1) {
      flats.push(item);
      continue;
    }
    const list = byL1.get(item.l1) ?? [];
    list.push(item);
    byL1.set(item.l1, list);
  }

  const l1Names = [...byL1.keys()].sort(
    (a, b) => l1DisplayRank(a) - l1DisplayRank(b) || a.localeCompare(b, "zh"),
  );
  const blocks: FolderNavBlock[] = l1Names.map((name) =>
    buildL1Block(name, byL1.get(name) ?? []),
  );

  if (flats.length > 0) {
    blocks.push({
      kind: "ungrouped",
      folders: flats.map((item) => ({
        folder: item.folder,
        label: item.label,
      })),
    });
  }

  return { pinned, blocks };
}

function blockGroupName(block: FolderNavBlock): string | null {
  if (block.kind === "l1") return block.name;
  if (block.kind === "ungrouped") return UNGROUPED_L1;
  if (block.kind === "overflow") return "其他";
  return null;
}

function overrideForGroup(groupName: string | null): string {
  if (!groupName || groupName === UNGROUPED_L1) return FLAT_GROUP_OVERRIDE;
  return groupName;
}

function replaceBlockMembers(
  block: FolderNavBlock,
  members: FavFolder[],
  overrides: FavFolderGroupOverrides = {},
): FolderNavBlock {
  const described = members.map((folder) => describeFolder(folder, overrides));
  if (block.kind === "flat") {
    const folder = members[0] ?? block.folder;
    const item = described[0] ?? describeFolder(folder, overrides);
    return {
      kind: "flat",
      folder,
      label: item.label,
    };
  }
  if (block.kind === "ungrouped") {
    return {
      kind: "ungrouped",
      folders: described.map((item) => ({
        folder: item.folder,
        label: item.label,
      })),
    };
  }
  if (block.kind === "l1") {
    return buildL1Block(block.name, described);
  }
  return buildL1Block("其他", described);
}

function flattenAllBlocks(
  pinned: FavFolder[],
  blocks: FolderNavBlock[],
): FavFolder[] {
  return [
    ...pinned,
    ...blocks.flatMap((block) => flattenFolderNavBlock(block)),
  ];
}

export function reorderGroupedFavFolders(
  folders: FavFolder[],
  fromId: number,
  toId: number,
  overrides: FavFolderGroupOverrides = {},
): { folders: FavFolder[]; overrides: FavFolderGroupOverrides } | null {
  if (fromId === toId) return null;
  const { pinned, blocks } = groupFavFolders(folders, overrides);
  const fromBlockIndex = blocks.findIndex((block) =>
    flattenFolderNavBlock(block).some((folder) => folder.id === fromId),
  );
  const toBlockIndex = blocks.findIndex((block) =>
    flattenFolderNavBlock(block).some((folder) => folder.id === toId),
  );
  if (fromBlockIndex < 0 || toBlockIndex < 0) return null;

  const nextOverrides = { ...overrides };
  const nextBlocks = [...blocks];

  if (fromBlockIndex === toBlockIndex) {
    const members = flattenFolderNavBlock(nextBlocks[fromBlockIndex]);
    const from = members.findIndex((folder) => folder.id === fromId);
    const to = members.findIndex((folder) => folder.id === toId);
    if (from < 0 || to < 0) return null;
    const reordered = [...members];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    nextBlocks[fromBlockIndex] = replaceBlockMembers(
      nextBlocks[fromBlockIndex],
      reordered,
      nextOverrides,
    );
  } else {
    const fromMembers = flattenFolderNavBlock(nextBlocks[fromBlockIndex]);
    const toMembers = flattenFolderNavBlock(nextBlocks[toBlockIndex]);
    const moved = fromMembers.find((folder) => folder.id === fromId);
    if (!moved) return null;
    const nextFrom = fromMembers.filter((folder) => folder.id !== fromId);
    const insertAt = toMembers.findIndex((folder) => folder.id === toId);
    const nextTo = [...toMembers];
    nextTo.splice(insertAt < 0 ? nextTo.length : insertAt, 0, moved);

    nextOverrides[String(fromId)] = overrideForGroup(
      blockGroupName(nextBlocks[toBlockIndex]),
    );

    if (nextFrom.length === 0) {
      nextBlocks.splice(fromBlockIndex, 1);
      const adjustedTo =
        fromBlockIndex < toBlockIndex ? toBlockIndex - 1 : toBlockIndex;
      nextBlocks[adjustedTo] = replaceBlockMembers(
        nextBlocks[adjustedTo],
        nextTo,
        nextOverrides,
      );
    } else {
      nextBlocks[fromBlockIndex] = replaceBlockMembers(
        nextBlocks[fromBlockIndex],
        nextFrom,
        nextOverrides,
      );
      nextBlocks[toBlockIndex] = replaceBlockMembers(
        nextBlocks[toBlockIndex],
        nextTo,
        nextOverrides,
      );
    }
  }

  return {
    folders: flattenAllBlocks(pinned, nextBlocks),
    overrides: nextOverrides,
  };
}

export function moveFavFolderIntoGroup(
  folders: FavFolder[],
  fromId: number,
  groupName: string,
  overrides: FavFolderGroupOverrides = {},
): { folders: FavFolder[]; overrides: FavFolderGroupOverrides } | null {
  const { pinned, blocks } = groupFavFolders(folders, overrides);
  const fromBlockIndex = blocks.findIndex((block) =>
    flattenFolderNavBlock(block).some((folder) => folder.id === fromId),
  );
  if (fromBlockIndex < 0) return null;

  const fromMembers = flattenFolderNavBlock(blocks[fromBlockIndex]);
  const moved = fromMembers.find((folder) => folder.id === fromId);
  if (!moved) return null;
  if (blockGroupName(blocks[fromBlockIndex]) === groupName) return null;

  const nextOverrides = {
    ...overrides,
    [String(fromId)]: overrideForGroup(groupName),
  };
  const nextFrom = fromMembers.filter((folder) => folder.id !== fromId);
  const nextBlocks = [...blocks];

  if (nextFrom.length === 0) {
    nextBlocks.splice(fromBlockIndex, 1);
  } else {
    nextBlocks[fromBlockIndex] = replaceBlockMembers(
      nextBlocks[fromBlockIndex],
      nextFrom,
      nextOverrides,
    );
  }

  const targetIndex = nextBlocks.findIndex(
    (block) => blockGroupName(block) === groupName,
  );
  if (targetIndex >= 0) {
    const targetMembers = [
      ...flattenFolderNavBlock(nextBlocks[targetIndex]),
      moved,
    ];
    nextBlocks[targetIndex] = replaceBlockMembers(
      nextBlocks[targetIndex],
      targetMembers,
      nextOverrides,
    );
  } else if (groupName === UNGROUPED_L1) {
    nextBlocks.push({
      kind: "ungrouped",
      folders: [{ folder: moved, label: moved.title }],
    });
  } else {
    nextBlocks.push(
      buildL1Block(groupName, [describeFolder(moved, nextOverrides)]),
    );
  }

  return {
    folders: flattenAllBlocks(pinned, nextBlocks),
    overrides: nextOverrides,
  };
}
