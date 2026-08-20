import { taxonomyRepo } from "../db/repositories/taxonomy";
import type { FavResource } from "@shared/types";

interface CategoryMatch {
  categoryL1Id: number | null;
  categoryL2Id: number | null;
  categoryL3Id: number | null;
}

/** 标题关键词 -> 三级分类路径。按命中分取最高，避免「第一条正则就停」导致计算机类分错。 */
type ScoredRule = {
  l1: string;
  l2?: string;
  l3?: string;
  keywords: Array<{ re: RegExp; score: number }>;
  exclude?: RegExp;
};

function k(source: string, score: number): { re: RegExp; score: number } {
  return { re: new RegExp(source, "i"), score };
}

const TITLE_RULES: ScoredRule[] = [
  // —— 计算机 · 前端（具体框架优先，vite 不再算进 Vue）——
  {
    l1: "计算机",
    l2: "前端",
    l3: "Vue",
    keywords: [
      k("vue[\\s._-]?3|vue3|vue2", 42),
      k("nuxt", 40),
      k("\\bpinia\\b", 38),
      k("\\bvuex\\b", 34),
      k("element[\\s-]?plus|elementui|vant\\b", 32),
      k("\\bvue\\b|vuejs|vue\\.js", 34),
    ],
    exclude: /react\s*native/i,
  },
  {
    l1: "计算机",
    l2: "前端",
    l3: "React",
    keywords: [
      k("next\\.?js|\\bnextjs\\b", 42),
      k("\\bredux\\b|zustand|react-query|\\btanstack\\b", 36),
      k("\\bjsx\\b|\\btsx\\b", 22),
      k("\\breact\\b|reactjs|react\\.js", 34),
    ],
    exclude: /react\s*native/i,
  },
  {
    l1: "计算机",
    l2: "前端",
    l3: "TypeScript",
    keywords: [
      k("typescript|\\btsconfig\\b", 40),
      k("\\btsx\\b", 24),
      k("类型体操|ts类型", 36),
    ],
  },
  {
    l1: "计算机",
    l2: "前端",
    keywords: [
      k("前端|front[-\\s]?end", 36),
      k("javascript|\\becmascript\\b", 34),
      k(
        "\\bwebpack\\b|\\bvite\\b|\\brollup\\b|\\besbuild\\b|turbopack|\\bbabel\\b",
        32,
      ),
      k("\\btailwind\\b|\\bless\\b|\\bsass\\b|\\bscss\\b", 30),
      k("\\bcss3?\\b|css模块|css布局|flex布局|grid布局", 28),
      k("\\bhtml5?\\b", 22),
      k("\\bjs\\b(?![a-z])", 18),
      k("electron|微前端|qiankun|单页应用|\\bspa\\b|浏览器原理|浏览器渲染", 30),
      k("uniapp|uni-app|小程序|\\btaro\\b|微信小程序", 32),
      k("web开发|全栈前端|前端工程化|eslint|prettier", 28),
      k(
        "promise|async|await|闭包|原型链|事件循环|event loop|宏任务|微任务",
        30,
      ),
      k("防抖|节流|深拷贝|浅拷贝|虚拟dom|\\bvdom\\b|响应式原理|双向绑定", 28),
      k("axios|跨域|\\bcors\\b|jwt|鉴权|无感刷新", 26),
      k("pnpm|\\bnpm\\b|\\byarn\\b|\\bmonorepo\\b", 24),
      k("three\\.?js|\\bwebgl\\b|\\bcanvas\\b|echarts|antv", 26),
    ],
    exclude: /react\s*native/i,
  },

  // —— 计算机 · 移动开发（不要被 React / 前端吃掉）——
  {
    l1: "计算机",
    l2: "移动开发",
    keywords: [
      k("react\\s*native|\\brn项目\\b", 44),
      k("\\bflutter\\b|dart语言", 42),
      k("kotlin|jetpack|android\\s*studio|安卓开发|android开发", 40),
      k("\\bswiftui\\b|\\bswift\\b|ios开发|xcode", 38),
      k("鸿蒙|harmonyos|arkts|arkui", 40),
      k("移动端开发|app开发|跨端", 24),
    ],
  },

  // —— 计算机 · 后端 ——
  {
    l1: "计算机",
    l2: "后端",
    l3: "Node.js",
    keywords: [
      k("node\\.?js|\\bnodejs\\b", 40),
      k("\\bnestjs\\b|nest\\.js", 40),
      k("\\bexpress\\b", 32),
      k("\\bkoa\\b|\\bfastify\\b|\\bdeno\\b|\\bbun\\b", 32),
    ],
  },
  {
    l1: "计算机",
    l2: "后端",
    l3: "Java",
    keywords: [
      k(
        "spring[\\s-]?boot|springboot|spring[\\s-]?cloud|springframework|springmvc|spring框架|spring入门|spring教程",
        44,
      ),
      k("\\bmybatis\\b|mybatis-plus", 40),
      k("\\bjava\\b(?!script)", 36),
      k("\\bjvm\\b|juc\\b|netty\\b", 34),
      k("\\bmaven\\b|\\bgradle\\b", 28),
      k("dubbo|zookeeper|springsecurity", 32),
    ],
  },
  {
    l1: "计算机",
    l2: "后端",
    l3: "Go",
    keywords: [
      k("\\bgolang\\b|go语言|go 语言", 44),
      k("gin框架|\\bgin\\b.*go|go.*\\bgin\\b", 38),
      k("go-zero|gozero|\\bgorm\\b|goroutine|go module", 36),
    ],
  },
  {
    l1: "计算机",
    l2: "后端",
    l3: "Python",
    keywords: [
      k("\\bpython\\b", 32),
      k("\\bdjango\\b|\\bflask\\b|\\bfastapi\\b", 40),
      k("\\bpandas\\b|\\bnumpy\\b", 30),
      k("爬虫|scrapy|selenium", 28),
    ],
    exclude: /机器学习|深度学习|pytorch|tensorflow|神经网络|大模型|llm/i,
  },
  {
    l1: "计算机",
    l2: "爬虫",
    keywords: [
      k("网络爬虫|爬虫教程|爬虫实战|\\bscrapy\\b|\\bselenium\\b", 38),
      k("爬虫", 32),
    ],
    exclude: /机器学习|深度学习|pytorch|tensorflow|神经网络|大模型|llm/i,
  },
  {
    l1: "计算机",
    l2: "后端",
    l3: "C/C++",
    keywords: [
      k("c\\+\\+|\\bcpp\\b|modern c\\+\\+", 42),
      k("c语言|c 语言", 40),
      k("\\bcmake\\b", 30),
      k("\\bqt\\b", 22),
    ],
  },
  {
    l1: "计算机",
    l2: "后端",
    l3: "Rust",
    keywords: [
      k("rust语言|rust 语言|\\brustc\\b|rustlang", 44),
      k("\\btokio\\b|\\bactix\\b|\\bcargo\\b", 36),
      k("\\brust\\b(?=.*(编程|教程|所有权|生命周期|异步|开发|入门|实战))", 34),
      k("(编程|教程|所有权|生命周期|异步|开发).*\\brust\\b", 34),
    ],
  },
  {
    l1: "计算机",
    l2: "后端",
    keywords: [
      k("后端|back[-\\s]?end|服务端", 34),
      k("微服务|中间件|\\brpc\\b|\\bgrpc\\b", 32),
      k("api开发|接口开发|restful|接口文档", 28),
      k("消息队列|rabbitmq|\\bkafka\\b|rocketmq", 30),
      k("设计模式|面向对象|\\boop\\b|领域驱动|\\bddd\\b", 26),
      k("高并发|分布式|限流|熔断|负载均衡|网关", 28),
      k("\\bphp\\b|\\blaravel\\b|\\bc#\\b|\\.net\\b|dotnet", 28),
    ],
  },

  // —— 计算机 · 数据库 / 网络 / 运维 / 算法 ——
  {
    l1: "计算机",
    l2: "数据库",
    keywords: [
      k("\\bmysql\\b|\\bredis\\b|\\bmongodb\\b|postgres|postgresql", 40),
      k("\\belasticsearch\\b|\\bclickhouse\\b|\\bsqlite\\b", 36),
      k("数据库|sql优化|索引优化|事务隔离|innodb", 34),
      k("\\bsql\\b", 22),
    ],
  },
  {
    l1: "计算机",
    l2: "计算机网络",
    keywords: [
      k("计算机网络|tcp/ip|tcp协议|udp协议", 42),
      k("http协议|https协议|\\bhttp/2\\b|\\bhttp3\\b", 36),
      k("websocket|三次握手|四次挥手|osi模型", 36),
      k("网络协议|抓包|wireshark|socket编程", 32),
      k("dns解析|dns协议", 28),
    ],
    exclude: /路由器评测|无线路由|家用路由/i,
  },
  {
    l1: "计算机",
    l2: "运维",
    keywords: [
      k("\\bdocker\\b|kubernetes|\\bk8s\\b|\\bdevops\\b", 42),
      k("nginx|jenkins|terraform|ansible|prometheus", 36),
      k("ci/?cd|持续集成|容器化", 32),
      k("运维|centos|ubuntu服务器|shell脚本", 30),
      k("\\blinux\\b(?!.*(评测|开箱|装机|数码))", 24),
    ],
  },
  {
    l1: "计算机",
    l2: "算法",
    keywords: [
      k("leetcode|力扣|lintcode", 42),
      k("数据结构|算法导论|算法题", 38),
      k("动态规划|\\bdp\\b.*题|贪心|二分查找|图论|二叉树|链表反转", 34),
      k("\\bacm\\b|算法竞赛|编程竞赛", 32),
      k("\\b算法\\b", 22),
    ],
    exclude: /数学竞赛|电竞|游戏竞赛|知识竞赛/i,
  },

  // —— 计算机 · AI ——
  {
    l1: "计算机",
    l2: "人工智能",
    l3: "Agent",
    keywords: [
      k("智能体|ai\\s*agent|agent开发|多智能体|multi-?agent", 44),
      k("\\blangchain\\b|langgraph|autogpt|crewai|openai\\s*agents", 42),
      k("mcp协议|mcp server|mcp工具|model context protocol", 40),
      k("\\bcopilot\\b", 28),
    ],
  },
  {
    l1: "计算机",
    l2: "人工智能",
    l3: "LLM",
    keywords: [
      k("\\bllm\\b|大模型|大语言模型", 42),
      k("chatgpt|gpt-?4|gpt-?5|\\bgpt\\b", 36),
      k(
        "\\bclaude\\b|\\bdeepseek\\b|通义千问|文心一言|\\bqwen\\b|\\bllama\\b",
        36,
      ),
      k("prompt工程|提示词|\\brag\\b|微调|\\bfinetune\\b|sft\\b", 34),
      k("ai学习|ai教程|ai面试|ai\\s*agent|\\bcodex\\b|cursor\\s*ai", 36),
    ],
  },
  {
    l1: "计算机",
    l2: "人工智能",
    keywords: [
      k("人工智能|机器学习|深度学习|神经网络", 40),
      k("\\bpytorch\\b|\\btensorflow\\b|\\bkeras\\b|sklearn", 40),
      k("计算机视觉|\\bopencv\\b|目标检测|transformer", 34),
      k("自然语言处理|\\bnlp\\b(?!.*(非语言))", 30),
      k("扩散模型|stable diffusion|\\bcomfyui\\b|aigc|midjourney", 28),
      k("(?<![a-z])ai(?![a-z])", 22),
    ],
  },

  // —— 计算机 · 系统 / 安全 / 嵌入式 / 硬核 ——
  {
    l1: "计算机",
    l2: "操作系统",
    keywords: [
      k("操作系统|\\bos原理\\b|计算机组成", 42),
      k("进程调度|内存管理|虚拟内存|内核|linux内核|cpu缓存", 36),
      k("编译原理|链接器|操作系统实验", 32),
    ],
  },
  {
    l1: "计算机",
    l2: "安全",
    keywords: [
      k("网络安全|web安全|信息安全|渗透测试", 42),
      k("漏洞|ctf|owasp|sql注入|xss\\b|csrf", 36),
      k("逆向工程|逆向(?!思维)|反编译|二进制安全|密码学应用", 34),
    ],
  },
  {
    l1: "计算机",
    l2: "量化",
    keywords: [
      k("量化交易|量化投资|量化策略|量化选股", 42),
      k("\\bquant\\b|cta策略|因子投资", 36),
      k("量化", 28),
    ],
    exclude: /量化宽松|逆向思维/i,
  },
  {
    l1: "计算机",
    l2: "嵌入式",
    keywords: [
      k("嵌入式|单片机|\\bstm32\\b|\\barduino\\b", 42),
      k("\\bfpga\\b|\\brtos\\b|\\bmcu\\b|物联网|\\besp32\\b", 38),
      k("树莓派|raspberry|keil|cubemx", 32),
    ],
  },
  {
    l1: "计算机",
    l2: "硬核科技",
    keywords: [
      k("光刻|半导体|芯片制程|晶圆", 42),
      k("risc-?v|指令集|微架构|cpu架构", 34),
      k("硬核科技|集成电路|soc设计", 32),
    ],
    exclude: /评测|开箱/i,
  },
  {
    l1: "计算机",
    l2: "游戏开发",
    keywords: [
      k("游戏开发|游戏引擎|\\bgamedev\\b", 42),
      k("\\bunity\\b|unreal|\\bue5\\b|\\bue4\\b|\\bgodot\\b|\\bcocos\\b", 40),
    ],
  },
  {
    l1: "计算机",
    l2: "数据可视化",
    keywords: [
      k("数据可视化|可视化|\\becharts\\b|\\bd3\\.?js\\b|\\bantv\\b", 36),
      k("\\btableau\\b|\\bsuperset\\b|图表库", 32),
    ],
  },

  // —— 计算机 · 兜底：宁可进「计算机」，也不要大量进「其他」——
  {
    l1: "计算机",
    keywords: [
      k(
        "编程|写代码|软件工程|程序员|开发教程|源码|计算机基础|计算机科学|项目实战|从入门到精通",
        24,
      ),
      k("手写|底层原理|源码剖析|重构|调试|\\bdebug\\b|全栈|架构师", 22),
      k("\\b代码\\b|软件开发|技术分享|开发者", 20),
      k("\\bvscode\\b|visual studio code|\\bcursor\\b", 22),
      k("黑马程序员|尚硅谷|狂神说", 22),
      k("\\bgit\\b|\\bgithub\\b|gitlab|开源项目", 18),
      k("\\b计算机\\b", 18),
      k("环境搭建|开发环境|实战项目|技术教程", 16),
    ],
    exclude: /考研|408|肖秀荣|计算机二级|计算机等级/i,
  },

  // —— 学习 ——
  {
    l1: "学习",
    l2: "考研",
    keywords: [
      k("计算机考研|408", 44),
      k("考研|肖秀荣|张宇|汤家凤|王道考研", 36),
      k("\\b政治\\b(?=.*(考研|肖秀荣))|(考研).*政治", 32),
    ],
  },
  {
    l1: "学习",
    l2: "外语",
    l3: "英语",
    keywords: [
      k("英语|雅思|托福|\\bgre\\b|四六级|\\bcet-?4\\b|\\bcet-?6\\b", 32),
      k("背单词|口语|听力.*英语|英语听力", 28),
    ],
  },
  {
    l1: "学习",
    l2: "外语",
    l3: "日语",
    keywords: [
      k("日语|\\bjlpt\\b|五十音", 34),
      k("\\bn[1-3]\\b(?=.*日语)|日语.*n[1-3]", 30),
    ],
  },
  {
    l1: "学习",
    l2: "外语",
    keywords: [k("外语|韩语|法语|德语|西班牙语", 28)],
  },
  {
    l1: "学习",
    l2: "数学",
    keywords: [
      k("微积分|线性代数|概率论|高等数学|考研数学", 36),
      k("\\b数学\\b", 18),
    ],
  },
  {
    l1: "学习",
    l2: "面试",
    keywords: [k("八股|求职|校招|社招|简历优化", 32), k("\\b面试\\b", 22)],
    exclude: /前端|后端|java|vue|react|算法|leetcode|力扣/i,
  },
  {
    l1: "学习",
    l2: "课程",
    keywords: [k("公开课|网课|学习笔记", 18), k("零基础入门", 14)],
    exclude: /前端|后端|java|python|vue|react|算法|编程|开发/i,
  },

  // —— 娱乐 / 生活（避开计算机抢词）——
  {
    l1: "娱乐",
    l2: "游戏",
    keywords: [
      k("原神|王者荣耀|塞尔达|黑神话|\\bminecraft\\b|\\bsteam\\b", 36),
      k("\\b电竞\\b|\\b游戏\\b", 20),
    ],
    exclude: /游戏开发|游戏引擎|unity|unreal|godot|cocos|ue5|编程/i,
  },
  {
    l1: "娱乐",
    l2: "影视",
    keywords: [
      k("电影|电视剧|影评|追剧|番剧|动漫|二次元", 28),
      k("导演|演员|小品|春晚|电影人", 24),
      k("\\b动画\\b", 16),
    ],
  },
  {
    l1: "娱乐",
    l2: "音乐",
    keywords: [k("音乐|歌曲|钢琴|吉他|演奏|翻唱|乐理", 26)],
  },
  {
    l1: "生活",
    l2: "家居",
    keywords: [k("装修|家居|户型|室内设计|别墅|全屋定制", 28)],
  },
  {
    l1: "生活",
    l2: "美食",
    keywords: [k("美食|做饭|烹饪|菜谱|探店|吃播|烘焙", 28)],
  },
  {
    l1: "生活",
    l2: "旅游",
    keywords: [k("旅游|旅行|\\bvlog\\b|自驾|攻略|景点|酒店", 24)],
  },
  {
    l1: "生活",
    l2: "健身",
    keywords: [k("健身|减肥|瑜伽|跑步|增肌|训练计划", 26)],
  },
  {
    l1: "生活",
    l2: "数码",
    keywords: [
      k("数码|开箱|装机|评测", 26),
      k("显卡|耳机|手机(?!.*(开发|android|ios))", 22),
    ],
    exclude: /编程|代码|开发教程|linux内核|驱动程序|编译/i,
  },
  {
    l1: "生活",
    l2: "财经",
    keywords: [k("财经|股票|基金|理财|投资|房价", 26)],
  },
  {
    l1: "生活",
    l2: "科普",
    keywords: [k("科普|纪录片|天文", 24), k("物理|化学|生物", 16)],
    exclude: /计算机|编程|python|java|算法/i,
  },
  {
    l1: "生活",
    l2: "社会人文",
    keywords: [
      k("社会人文|人文社科|文史哲|历史人文", 42),
      k("哲学|思想实验|存在主义|尼采|康德|柏拉图|黑格尔", 34),
      k("人文|社科|社会学|人类学", 30),
      k("女权|女性主义|性别议题|厌女|男权", 34),
      k("历史|考古|文物|通史|近代史|中国史", 26),
      k("文学|读书|书评|作家|散文|诗歌|小说家", 26),
      k("时评|时事|社会议题|公共讨论|热点评论", 28),
      k("访谈|对谈|对线|人物志|传记|口述|纪实", 24),
      k("祛魅|精气神|看世界|睁眼", 30),
      k("职场|实习|打工人|大厂|双非|校招故事", 22),
      k("首富|发家|商业传奇|创业故事|人物故事", 24),
      k("摄影|纪实摄影|人文摄影", 26),
      k("环保|公益|垃圾分类|清理垃圾|捡垃圾", 22),
      k("高校|学霸|北大|清华(?!.*(开发|编程|算法))", 16),
    ],
    exclude: /考研政治|408|java|vue|react|leetcode|前端|后端|编程教程/i,
  },
];

const MIN_CS_SCORE = 8;
/** 非计算机方向略放宽，避免「社会人文」这类词不够硬就进其他 */
const MIN_OTHER_SCORE = 12;

function ruleScore(title: string, rule: ScoredRule): number {
  if (rule.exclude) {
    rule.exclude.lastIndex = 0;
    if (rule.exclude.test(title)) return 0;
  }

  let score = 0;
  for (const item of rule.keywords) {
    item.re.lastIndex = 0;
    if (item.re.test(title)) score += item.score;
  }
  return score;
}

function ruleSpecificity(rule: ScoredRule): number {
  return (
    (rule.l3 ? 2 : 0) + (rule.l2 ? 1 : 0) + (rule.l1 === "计算机" ? 0.4 : 0)
  );
}

function pickMatch(rule: ScoredRule): { l1: string; l2?: string; l3?: string } {
  return { l1: rule.l1, l2: rule.l2, l3: rule.l3 };
}

export function matchTitleToCategory(
  title: string,
): { l1: string; l2?: string; l3?: string } | null {
  const text = title.normalize("NFKC").toLowerCase();
  const ranked = TITLE_RULES.map((rule) => ({
    rule,
    score: ruleScore(text, rule),
  }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || ruleSpecificity(b.rule) - ruleSpecificity(a.rule),
    );

  const best = ranked[0];
  const bestCs = ranked.find((item) => item.rule.l1 === "计算机");

  if (
    best &&
    best.rule.l1 !== "计算机" &&
    bestCs &&
    bestCs.score >= MIN_CS_SCORE
  ) {
    if (best.score - bestCs.score < 10) {
      return pickMatch(bestCs.rule);
    }
  }

  if (best && best.rule.l1 === "计算机" && best.score >= MIN_CS_SCORE) {
    return resolveCloseL3(ranked, best);
  }

  if (best && best.score >= MIN_OTHER_SCORE) {
    return resolveCloseL3(ranked, best);
  }

  if (bestCs && bestCs.score >= MIN_CS_SCORE) {
    return pickMatch(bestCs.rule);
  }

  return fallbackCategory(text);
}

function resolveCloseL3(
  ranked: Array<{ rule: ScoredRule; score: number }>,
  best: { rule: ScoredRule; score: number },
): { l1: string; l2?: string; l3?: string } {
  const second = ranked[1];
  if (
    second &&
    best.rule.l1 === second.rule.l1 &&
    best.rule.l2 &&
    best.rule.l2 === second.rule.l2 &&
    best.rule.l3 &&
    second.rule.l3 &&
    best.rule.l3 !== second.rule.l3 &&
    best.score - second.score < 8
  ) {
    return { l1: best.rule.l1, l2: best.rule.l2 };
  }
  return pickMatch(best.rule);
}

function fallbackCategory(
  text: string,
): { l1: string; l2?: string; l3?: string } | null {
  if (/哲学|人文|女权|时评|访谈|社会议题|精气神|祛魅/.test(text)) {
    return { l1: "生活", l2: "社会人文" };
  }
  if (
    /编程|写代码|源码|开发教程|软件工程|环境搭建|从零.*(开发|编程)|第\d+讲.*(java|vue|react|python|算法)/.test(
      text,
    )
  ) {
    return { l1: "计算机" };
  }
  if (/搞笑|沙雕|整活|鬼畜|综艺/.test(text)) {
    return { l1: "娱乐", l2: "影视" };
  }
  if (/攻略|通关|抽卡/.test(text)) {
    return { l1: "娱乐", l2: "游戏" };
  }
  if (/穿搭|护肤|彩妆|好物推荐/.test(text)) {
    return { l1: "生活" };
  }
  return null;
}

export const BILI_OTHER_FOLDER_TITLE = "其他";
const BILI_FOLDER_TITLE_MAX = 20;
const BILI_DEFAULT_FOLDER_TITLES = new Set(["默认收藏夹", "default"]);
const EXISTING_FOLDER_MIN_SCORE = 12;
const CANONICAL_FOLDER_MIN_SCORE = 20;

/** 同一主题的叫法，避免「算法与数据结构」旁边再新建「计算机-算法」 */
const FOLDER_TOPIC_ALIASES: string[][] = [
  ["算法", "数据结构", "leetcode", "力扣", "oj"],
  ["前端", "vue", "react", "javascript", "css", "html"],
  ["后端", "java", "spring", "golang", "go语言", "node"],
  ["人工智能", "大模型", "机器学习", "深度学习", "llm", "ai"],
  ["量化", "量化交易", "quant", "量化投资"],
  ["逆向", "逆向工程", "反编译", "二进制"],
  ["爬虫", "scrapy", "selenium", "crawler"],
  ["数据库", "mysql", "redis", "sql"],
  ["操作系统", "os", "linux内核"],
  ["计算机网络", "网络", "tcp"],
  ["嵌入式", "单片机", "stm32", "fpga"],
  ["安全", "网络安全", "渗透"],
  ["社会人文", "历史人文", "人文", "哲学"],
  ["影视", "电影", "剧"],
];

export function isDumpFolderTitle(name: string): boolean {
  return /^其他(-\d+)?$/.test(name.trim());
}

export function isGeneratedPrefixedFolderTitle(name: string): boolean {
  return /^(计算机|学习|娱乐|生活)-/.test(name.trim());
}

function generatedTopic(name: string): string {
  const match = name.trim().match(/^(?:计算机|学习|娱乐|生活)-(.+)$/);
  return match?.[1] ?? "";
}

function normalizeClassifyText(text: string): string {
  return text.normalize("NFKC").toLowerCase().trim();
}

function folderNameTokens(name: string): string[] {
  return normalizeClassifyText(name)
    .split(/[\s\-_/|·,，]+/)
    .filter((token) => token.length >= 2);
}

function taxonomyFolderOverlapScore(
  folderTitle: string,
  matched: { l1: string; l2?: string; l3?: string } | null,
  preferred: string | null,
): number {
  if (!matched) return 0;
  const folder = normalizeClassifyText(folderTitle);
  let score = 0;

  if (preferred && folder === normalizeClassifyText(preferred)) score += 50;

  for (const part of [matched.l3, matched.l2, matched.l1]) {
    if (!part) continue;
    const needle = normalizeClassifyText(part);
    if (needle.length < 2) continue;
    if (folder === needle) score += 42;
    else if (folder.includes(needle)) score += 36;
    else if (needle.includes(folder) && folder.length >= 2) score += 22;
  }

  const matchBlob = [preferred, matched.l3, matched.l2, matched.l1]
    .filter(Boolean)
    .join(" ");
  const matchNorm = normalizeClassifyText(matchBlob);
  for (const group of FOLDER_TOPIC_ALIASES) {
    const folderHit = group.some((key) => folder.includes(key));
    const matchHit = group.some((key) => matchNorm.includes(key));
    if (folderHit && matchHit) score += 28;
  }

  if (isGeneratedPrefixedFolderTitle(folderTitle)) score -= 10;
  return score;
}

export function findCanonicalExistingFolder(
  existingTitles: Iterable<string>,
  matched: { l1: string; l2?: string; l3?: string } | null,
  preferred: string | null,
): string | null {
  const existing = [...new Set(existingTitles)].filter(
    (name) =>
      !BILI_DEFAULT_FOLDER_TITLES.has(name.toLowerCase()) &&
      !isDumpFolderTitle(name),
  );
  let bestName = "";
  let bestScore = 0;
  for (const name of existing) {
    const overlap = taxonomyFolderOverlapScore(name, matched, preferred);
    const total = overlap + (isGeneratedPrefixedFolderTitle(name) ? -16 : 12);
    if (
      total > bestScore ||
      (total === bestScore && name.length > bestName.length)
    ) {
      bestScore = total;
      bestName = name;
    }
  }
  return bestScore >= CANONICAL_FOLDER_MIN_SCORE ? bestName : null;
}

/** 「计算机-算法」这类生成夹，若已有「算法与数据结构」则视为重复源，应并回去 */
export function listDuplicateGeneratedFolderTitles(
  folders: Array<{ title: string; isDefault?: boolean }>,
): string[] {
  const titles = folders
    .filter(
      (folder) =>
        !folder.isDefault &&
        !BILI_DEFAULT_FOLDER_TITLES.has(folder.title.toLowerCase()) &&
        !isDumpFolderTitle(folder.title),
    )
    .map((folder) => folder.title);

  const duplicates: string[] = [];
  for (const title of titles) {
    if (!isGeneratedPrefixedFolderTitle(title)) continue;
    const topic = generatedTopic(title);
    if (topic.length < 2) continue;
    const canonical = titles.find(
      (other) =>
        other !== title &&
        !isGeneratedPrefixedFolderTitle(other) &&
        (normalizeClassifyText(other).includes(normalizeClassifyText(topic)) ||
          FOLDER_TOPIC_ALIASES.some(
            (group) =>
              group.some((key) => normalizeClassifyText(other).includes(key)) &&
              group.some((key) => normalizeClassifyText(topic).includes(key)),
          )),
    );
    if (canonical) duplicates.push(title);
  }
  return duplicates;
}

function existingFolderHintScore(
  folderTitle: string,
  videoTitle: string,
): number {
  const folder = normalizeClassifyText(folderTitle);
  const video = normalizeClassifyText(videoTitle);
  let score = 0;

  if (
    /前端/.test(folder) &&
    /前端|vue|react|javascript|\bjs\b|typescript|css|html|小程序/.test(video)
  ) {
    score += 16;
  }
  if (
    /可视化|visual/.test(folder) &&
    /可视化|echarts|图表|\bd3\b|antv/.test(video)
  ) {
    score += 18;
  }
  if (
    /(^|[\s_\-])ai([\s_\-]|$)|人工智能/.test(folder) &&
    /(?<![a-z])ai(?![a-z])|人工智能|大模型|\bllm\b|\bgpt\b|agent|智能体|prompt|cursor|\bmcp\b/.test(
      video,
    )
  ) {
    score += 18;
  }
  if (/项目/.test(folder) && /项目|实战|\bdemo\b|产品/.test(video)) {
    score += 8;
  }
  if (/skill/.test(folder) && /skill|\bmcp\b|cursor|提示词|agent/.test(video)) {
    score += 12;
  }
  if (
    /house|家居|装修|户型/.test(folder) &&
    /装修|家居|户型|室内|别墅|房子|furniture|interior|dream house/.test(video)
  ) {
    score += 18;
  }
  if (
    /社会|人文|历史|哲学|思想/.test(folder) &&
    /社会|人文|哲学|女权|历史|访谈|时评|思想|职场|实习|摄影|传记|人物|祛魅|精气神|对线/.test(
      video,
    )
  ) {
    score += 22;
  }
  if (
    /算法|数据结构|力扣|leetcode/.test(folder) &&
    /算法|数据结构|leetcode|力扣|动态规划|链表|二叉树/.test(video)
  ) {
    score += 22;
  }
  if (
    /机器学习|深度学习|神经网络/.test(folder) &&
    /机器学习|深度学习|神经网络|(?<![a-z])ai(?![a-z])|人工智能|大模型|\bllm\b/.test(
      video,
    )
  ) {
    score += 22;
  }
  if (
    /量化/.test(folder) &&
    /量化|quant|回测|因子|cta/.test(video)
  ) {
    score += 22;
  }
  if (
    /逆向/.test(folder) &&
    !/逆向思维/.test(folder) &&
    /逆向|反编译|二进制|\bctf\b|\bpwn\b/.test(video)
  ) {
    score += 22;
  }
  if (
    /爬虫/.test(folder) &&
    /爬虫|scrapy|selenium|crawler/.test(video)
  ) {
    score += 22;
  }

  return score;
}

function scoreExistingFolder(
  videoTitle: string,
  folderTitle: string,
  taxonomy: { l1: string; l2?: string; l3?: string } | null,
): number {
  if (BILI_DEFAULT_FOLDER_TITLES.has(folderTitle.toLowerCase())) return 0;

  const video = normalizeClassifyText(videoTitle);
  const folder = normalizeClassifyText(folderTitle);
  if (folder.length < 2) return 0;

  let score = 0;
  if (video.includes(folder)) score += 42;

  for (const token of folderNameTokens(folderTitle)) {
    if (video.includes(token)) {
      score += token.length >= 4 ? 16 : 10;
    }
  }

  score += existingFolderHintScore(folderTitle, videoTitle);

  score += taxonomyFolderOverlapScore(
    folderTitle,
    taxonomy,
    taxonomy ? preferredBiliOrganizeTitleFromMatch(taxonomy) : null,
  );

  return score;
}

function preferredBiliOrganizeTitleFromMatch(matched: {
  l1: string;
  l2?: string;
  l3?: string;
}): string {
  const preferred = matched.l2 ? `${matched.l1}-${matched.l2}` : matched.l1;
  return preferred.slice(0, BILI_FOLDER_TITLE_MAX);
}

export function buildFavClassifyText(item: {
  title: string;
  intro?: string;
  upper?: { name?: string };
}): string {
  return [item.title, item.intro ?? "", item.upper?.name ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

export function preferredBiliOrganizeTitle(title: string): string | null {
  const matched = matchTitleToCategory(title);
  if (!matched) return null;
  return preferredBiliOrganizeTitleFromMatch(matched);
}

/**
 * 先归入用户已有收藏夹（含「算法与数据结构」对「算法」这种包含关系）；
 * 对不上再按方向新建。分不出来就返回 null，不要堆进「其他」。
 */
export function resolveBiliOrganizeFolderTitle(
  title: string,
  existingTitles: Iterable<string>,
): string | null {
  const existing = [...new Set(existingTitles)].filter(
    (name) =>
      !BILI_DEFAULT_FOLDER_TITLES.has(name.toLowerCase()) &&
      !isDumpFolderTitle(name),
  );
  const matched = matchTitleToCategory(title);
  const preferred = matched
    ? preferredBiliOrganizeTitleFromMatch(matched)
    : null;
  const canonical = findCanonicalExistingFolder(existing, matched, preferred);
  if (canonical) return canonical;

  let bestName = "";
  let bestScore = 0;
  for (const name of existing) {
    const score = scoreExistingFolder(title, name, matched);
    if (
      score > bestScore ||
      (score === bestScore && name.length > bestName.length)
    ) {
      bestScore = score;
      bestName = name;
    }
  }

  if (bestName && bestScore >= EXISTING_FOLDER_MIN_SCORE) {
    return bestName;
  }

  if (!matched || !preferred || isDumpFolderTitle(preferred)) return null;

  const extraAliases =
    matched.l2 === "社会人文" ? ["历史人文", "社会人文", "人文"] : [];
  const aliases = [preferred, matched.l2, matched.l3, ...extraAliases].filter(
    (name): name is string =>
      Boolean(name) &&
      name.length <= BILI_FOLDER_TITLE_MAX &&
      !BILI_DEFAULT_FOLDER_TITLES.has(name.toLowerCase()) &&
      !isDumpFolderTitle(name),
  );

  for (const name of aliases) {
    if (existing.includes(name)) return name;
  }
  return preferred;
}

function buildAssignment(item: FavResource, match: CategoryMatch) {
  return {
    mediaId: item.id,
    avid: item.id,
    bvid: item.bvid,
    title: item.title,
    cover: item.cover,
    upperName: item.upper.name,
    duration: item.duration,
    ...match,
  };
}

const BATCH_SIZE = 100;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function classifyFavoriteTitle(title: string): CategoryMatch {
  const writer = taxonomyRepo.createClassificationWriter();
  return classifyFavoriteTitleWithWriter(writer, title);
}

function classifyFavoriteTitleWithWriter(
  writer: ReturnType<typeof taxonomyRepo.createClassificationWriter>,
  title: string,
): CategoryMatch {
  const matched = matchTitleToCategory(title);
  if (!matched) {
    const other = writer.findOrCreateL1("其他");
    return { categoryL1Id: other.id, categoryL2Id: null, categoryL3Id: null };
  }

  const l1 = writer.findOrCreateL1(matched.l1);

  let l2Id: number | null = null;
  let l3Id: number | null = null;

  if (matched.l2) {
    const l2 = writer.findOrCreateL2(l1.id, matched.l2);
    l2Id = l2.id;
    if (matched.l3) {
      const l3 = writer.findOrCreateL3(l2.id, matched.l3);
      l3Id = l3.id;
      l2Id = l3.categoryL2Id;
    }
  }

  return { categoryL1Id: l1.id, categoryL2Id: l2Id, categoryL3Id: l3Id };
}

export async function classifyFavoriteItemsAsync(
  items: FavResource[],
  onProgress?: (done: number, total: number) => void,
  options?: { resetCategories?: boolean },
): Promise<number> {
  taxonomyRepo.ensureExtendedFavTaxonomy();
  if (options?.resetCategories !== false) {
    taxonomyRepo.resetFavCategoriesForClassify();
  } else {
    taxonomyRepo.repairTaxonomy();
  }

  const writer = taxonomyRepo.createClassificationWriter();
  const assignments: ReturnType<typeof buildAssignment>[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const match = classifyFavoriteTitleWithWriter(
      writer,
      buildFavClassifyText(item),
    );
    assignments.push(buildAssignment(item, match));

    const done = index + 1;
    if (done % BATCH_SIZE === 0 || done === items.length) {
      onProgress?.(done, items.length);
      await yieldToEventLoop();
    }
  }

  writer.commitAssignments(assignments);
  return assignments.length;
}

export function classifyFavoriteItems(items: FavResource[]): number {
  const writer = taxonomyRepo.createClassificationWriter();
  const assignments = items.map((item) =>
    buildAssignment(
      item,
      classifyFavoriteTitleWithWriter(writer, buildFavClassifyText(item)),
    ),
  );
  writer.commitAssignments(assignments);
  return assignments.length;
}
