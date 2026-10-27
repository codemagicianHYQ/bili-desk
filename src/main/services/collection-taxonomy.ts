/**
 * 合集分类的打分目录：合集名、简介、视频标题、视频标签都作为证据，
 * 每条证据给所有二级分类打分，先比一级总分再在一级内挑二级。
 */

interface TaxonomyRule {
  l1: string;
  l2: string;
  /** 命中记 3 分 */
  strong: RegExp;
  /** 命中记 2 分 */
  medium?: RegExp;
  /** 命中记 1 分 */
  weak?: RegExp;
  exclude?: RegExp;
}

export interface Evidence {
  text: string;
  weight: number;
}

export interface TaxonomyMatch {
  l1: string;
  l2: string;
  score: number;
  /** 第二名一级分类的得分，用来判断是否压倒性 */
  runnerUp: number;
  /** 有几条证据命中了胜出的一级 */
  support: number;
}

const RULES: TaxonomyRule[] = [
  // 计算机
  {
    l1: "计算机",
    l2: "编程语言",
    strong:
      /python|java(?!script)|c\+\+|c语言|golang|\brust\b|编程|kotlin|c#|\.net|码农|写代码/,
    medium: /程序员|代码|源码|开发者/,
  },
  {
    l1: "计算机",
    l2: "前端",
    strong:
      /前端|vue|react|javascript|typescript|\bcss\b|\bhtml|小程序开发|uni-?app|webpack|vite\b|node\.?js|渡一|移动端适配|\bvw\b|vmin|\bbfc\b/,
  },
  {
    l1: "计算机",
    l2: "后端",
    strong:
      /后端|spring|微服务|mysql|redis|数据库(?!小程序)|\bsql\b|mybatis|消息队列|kafka/,
  },
  {
    l1: "计算机",
    l2: "算法",
    strong: /算法|数据结构|leetcode|力扣|刷题|\bacm\b/,
  },
  {
    l1: "计算机",
    l2: "运维",
    strong:
      /linux|docker|k8s|kubernetes|运维|nginx|服务器部署|devops|云计算|云原生/,
  },
  {
    l1: "计算机",
    l2: "网络安全",
    strong:
      /网络安全|渗透测试|(安全|系统|软件|网站|高危|零日|0day|php|web)\s*大?漏洞|漏洞(挖掘|利用|复现|扫描|分析)|黑客|白帽|\bctf\b|逆向工程|学逆向|软件逆向|反编译|破解版?软件|安全攻防|钓鱼攻击/,
  },
  {
    l1: "计算机",
    l2: "网络工程",
    strong:
      /网络工程|ccie|hcie|交换机|路由器|组网|\bnas\b|软路由|端口映射|\bping\b|ipv6|\bdns\b|webrtc|\bwhep\b|网络协议|输入(网址|url)/,
  },
  {
    l1: "计算机",
    l2: "计算机基础",
    strong:
      /操作系统|计算机网络|计算机组成|编译原理|\b408\b|计算机基础|计算机科学|计算机图形学|体系结构|数字逻辑/,
    medium: /计算机|\btcp\b|\bhttp|cpu原理|内存管理/,
  },
  {
    l1: "计算机",
    l2: "开发工具",
    strong:
      /配置文件|\bjson\b|\byaml\b|\btoml\b|\bxml\b|\bgit\b|github|vscode|vs code|命令行|正则表达式|markdown/,
    medium: /\bide\b|终端|\bshell\b|properties/,
  },
  {
    l1: "计算机",
    l2: "游戏开发",
    strong:
      /游戏开发|unity|虚幻引擎|unreal|\bue5\b|godot|独立游戏|qframework|蓝图开发|开发游戏|做游戏|开发.{0,20}游戏/,
  },
  {
    l1: "计算机",
    l2: "移动开发",
    strong: /android开发|安卓开发|ios开发|flutter|swiftui|鸿蒙开发|harmonyos/,
  },
  {
    l1: "计算机",
    l2: "嵌入式",
    strong:
      /嵌入式|单片机|stm32|arduino|esp32|\besp\b|树莓派|fpga|电路|pcb|电子积木|物联网|\brtos\b|电赛|lvgl|\bros\b/,
  },

  // AI
  {
    l1: "AI",
    l2: "AI绘画",
    strong: /ai绘画|ai绘图|ai画|midjourney|stable ?diffusion|comfyui|\blora\b/,
  },
  {
    l1: "AI",
    l2: "AI视频",
    strong:
      /ai视频|ai短片|ai动画|ai电影|ai\s?mv|sora|可灵|runway|即梦|海螺ai|数字人|ai生成视频|seedance|veo|ai全民制作人|用ai(做|记录|制作)/,
  },
  {
    l1: "AI",
    l2: "Agent",
    strong: /智能体|agent|\bmcp\b|coze|扣子|dify|n8n|ai工作流/,
  },
  {
    l1: "AI",
    l2: "大模型",
    strong:
      /大模型|chatgpt|\bgpt|deepseek|\bllm|claude|gemini|kimi|通义|文心一言|豆包|qwen|llama|提示词|prompt|\bvllm\b|\brag\b|langchain|ai\s?infra|ai早报|ai新闻/,
    medium: /token/,
    exclude: /区块链|币圈|web3/,
  },
  {
    l1: "AI",
    l2: "机器学习",
    strong:
      /机器学习|深度学习|神经网络|pytorch|tensorflow|transformer|强化学习|计算机视觉|逻辑回归|线性回归|感知机|\bmlp\b|layernorm|batchnorm|反向传播|梯度下降/,
  },
  {
    l1: "AI",
    l2: "AI工具",
    strong:
      /aigc|人工智能|ai工具|ai编程|vibe\s?coding|cursor|copilot|codex|ai办公|ai工程师|ai产品|ai应用|ai创业/,
    medium: /\bai\b|ai[\u4e00-\u9fa5]/,
  },

  // 技能
  {
    l1: "技能",
    l2: "摄影摄像",
    strong:
      /摄影|拍摄|摄像|布光|打光|构图|运镜|稳定器|延时摄影|航拍|无人机|单反|微单|相机|胶片|人像拍|拍照技巧|视频拍|电影感/,
    medium:
      /镜头|影棚|对焦|光圈|快门|曝光|调色|灯光|器材|大疆|佳能|尼康|富士|索尼(?!.{0,6}(回音壁|音箱|耳机|电视|游戏|ps5))/,
    exclude: /摄像头/,
  },
  {
    l1: "技能",
    l2: "视频剪辑",
    strong:
      /剪辑|premiere|\bpr\b|达芬奇|final ?cut|剪映|after ?effects|\bae\b教程|转场|视频制作|做视频|up主教程|后期/,
  },
  {
    l1: "技能",
    l2: "设计",
    strong:
      /平面设计|ui设计|\bux\b|photoshop|ps教程|figma|海报|logo|字体设计|排版|c4d|blender|3dmax|maya|建模|室内设计|建筑设计|配色/,
    medium: /设计|3d/,
    exclude: /数学建模|数模/,
  },
  {
    l1: "技能",
    l2: "绘画",
    strong:
      /绘画|素描|水彩|板绘|procreate|插画|速写|画画|手绘|油画|国画|漫画教程|人体结构/,
    exclude: /ai绘画|ai画/,
  },
  {
    l1: "技能",
    l2: "办公软件",
    strong: /excel|\bword\b|\bppt\b|办公技巧|office|wps|表格函数/,
  },
  {
    l1: "技能",
    l2: "写作表达",
    strong: /写作|演讲|文案|口才|表达力|播音|主持/,
  },
  {
    l1: "技能",
    l2: "手工",
    strong: /手工|木工|编织|折纸|模型制作|手作|刺绣|3d打印|手艺|匠人/,
  },

  // 科技
  {
    l1: "科技",
    l2: "数码",
    strong:
      /数码|手机|笔记本|显卡|装机|耳机|平板|ipad|iphone|macbook|mac\s?mini|开箱|显示器|键盘|鼠标|拆机|主板|电源|固态|ssd|内存条|pixel|华为|小米|apple|苹果全家桶|迷你主机|mini主机|游戏本|hifi|音响|音箱|回音壁|耳放|解码器|智能眼镜|ai眼镜|ai耳机|频闪|屏幕素质|外设/,
    medium: /电脑|芯片|评测|处理器|cpu|充电|硬件|半导体|安卓/,
  },
  {
    l1: "科技",
    l2: "软件工具",
    strong:
      /软件|\bapp\b|插件|浏览器|效率工具|神器|网站推荐|windows|macos|系统优化|开源项目/,
    medium: /测评/,
    weak: /工具/,
  },
  {
    l1: "科技",
    l2: "汽车",
    strong:
      /汽车|新能源车|电动车|试驾|赛车|车手|特斯拉|比亚迪|小米su7|车评|二手车|车知识|刹车|\bf1\b|motogp|摩托|ctcc|方程式|车队/,
    exclude: /自行车|公路车|单车/,
  },
  {
    l1: "科技",
    l2: "军事",
    strong: /军事|武器|战斗机|航母|导弹|坦克|军舰|潜艇|枪械/,
    medium: /战争|军队/,
  },
  {
    l1: "科技",
    l2: "航天天文",
    strong:
      /航天(?!级)|火箭|卫星|天文|星系|黑洞|太空|空间站|行星|恒星|宇宙(起源|探索|大爆炸|膨胀|飞船|尽头|射线)/,
    medium: /(^|[^\u4e00-\u9fa5])宇宙|说宇宙|聊宇宙/,
    exclude: /小宇宙|平行宇宙|漫威宇宙|全宇宙|航天级|火箭队|火箭少女/,
  },
  {
    l1: "科技",
    l2: "工程基建",
    strong: /基建|桥梁|高铁|制造业|工业|造船|港口|发动机|核电|大坝|工业机器人/,
    medium: /工程|机械|制造|发明|飞机|隧道|机器人|机械臂/,
    exclude: /纸飞机|机械硬盘|机械键盘|软件工程|机器人之梦|隧道尽头|镜头/,
  },
  {
    l1: "科技",
    l2: "科普",
    strong:
      /科普|冷知识|物理|化学|生物学|地理|地球|海洋|自然科学|科学实验|百科|量子|元素|神经科学|认知科学|动物学|野生动物|古生物|恐龙|演化史|进化论/,
    medium: /为什么|原理|科学|揭秘|真相|实验室/,
  },

  // 学习
  {
    l1: "学习",
    l2: "考试",
    strong: /考研|考公|高考|考试|四六级|雅思|托福|教资|期末|中考|真题/,
  },
  {
    l1: "学习",
    l2: "外语",
    strong: /英语|单词|口语|日语|韩语|外语|语法|听力|english/,
    exclude: /改编|翻唱|名曲|歌曲|suno|\bmv\b/,
  },
  {
    l1: "学习",
    l2: "数学",
    strong: /数学|高数|线性代数|线代|微积分|概率论|几何|奥数/,
  },
  {
    l1: "学习",
    l2: "职场",
    strong:
      /职场|面试|求职|简历|校招|秋招|春招|打工人|升职|职业规划|offer|面经|八股/,
    medium: /实习|副业|产品经理/,
  },
  {
    l1: "学习",
    l2: "大学",
    strong: /大学生|校园|学长|学姐|保研|留学|读研|考博|科研/,
    medium: /大学|研究生|博士/,
  },
  {
    l1: "学习",
    l2: "读书",
    strong: /读书|书单|阅读|文学|小说|诗词|名著|书评|作家/,
  },
  {
    l1: "学习",
    l2: "心理思维",
    strong:
      /心理|思维|情绪|自律|个人成长|学习方法|学习法|焦虑|内耗|拖延|潜意识|多巴胺|\badhd\b|孤独/,
    medium: /逻辑|效率|认知/,
    exclude: /逻辑回归|逻辑电路|数字逻辑|基础认知/,
  },
  {
    l1: "学习",
    l2: "公开课",
    strong: /公开课|网课|课程|讲座|系列课|小课/,
    weak: /教程|教学|入门|基础|讲解|干货/,
  },

  // 人文社科
  {
    l1: "人文社科",
    l2: "历史",
    strong:
      /历史|讲史|朝代|古代|三国|秦朝|汉朝|唐朝|宋朝|明朝|清朝|晚清|乾隆|康熙|中世纪|考古|文物|二战|近代史|通史|帝国|典籍/,
  },
  {
    l1: "人文社科",
    l2: "社会时事",
    strong: /社会|时事|时评|热点|新闻|国际|地缘|政治|社会学|民生|人类学/,
  },
  {
    l1: "人文社科",
    l2: "哲学",
    strong: /哲学|尼采|康德|存在主义|思想实验|叔本华|形而上/,
  },
  {
    l1: "人文社科",
    l2: "法律",
    strong: /法律|律师|刑法|民法|法考|法院|法官|判决|普法|劳动法|刑辩|法学/,
    medium: /维权|起诉|仲裁|合同纠纷/,
  },
  {
    l1: "人文社科",
    l2: "人物纪实",
    strong: /纪实|纪录片|人物|传记|访谈|真实事件|奇闻|案件|悬案/,
    medium: /故事/,
    exclude: /商业访谈/,
  },

  // 财经商业
  {
    l1: "财经商业",
    l2: "投资理财",
    strong:
      /股票|基金|理财|投资|炒股|股市|股海|a股|大a|美股|港股|美盘|房价|房产|保险|存款|复盘|交易员|交易策略|期货|黄金(?!六角|比例|分割|时段|时间|搭档|周|档|单身|圣斗士)|韭菜|雪球|楼市|买房|房地产|量化|定投|纳斯达克|游资|券商|爆仓|牛市|熊市|涨停|reits|币圈|比特币|加密货币/,
  },
  {
    l1: "财经商业",
    l2: "商业产业",
    strong:
      /商业|产业|企业|营销|赚钱|(?<!人)生意|供应链|创业|电商|商业访谈|消费趋势|出海/,
    medium: /公司|行业|品牌/,
  },
  {
    l1: "财经商业",
    l2: "经济",
    strong: /经济|财经|金融|货币|通胀|\bgdp\b|银行|关税|养老金|社保|网贷|借钱/,
  },

  // 生活
  {
    l1: "生活",
    l2: "美食",
    strong:
      /美食|做饭|菜谱|吃播|探店|烹饪|烘焙|料理|食谱|家常菜|吃货|干饭|自助餐|烧烤|\bbbq\b|调酒|鸡尾酒|早茶|小吃|海鲜|厨房|大厨|厨师|甜品|甜点|蛋糕|泡芙|马卡龙|面包|面食|刀削面|拉面|米粉|火锅|红烧|爆炒|卤味/,
    medium: /好吃|晚餐|早餐|午餐|一日三餐|吃饭|做法/,
  },
  {
    l1: "生活",
    l2: "运动健身",
    strong:
      /健身|减脂|增肌|运动|篮球|足球|跑步|跑鞋|马拉松|runner|体育|\bnba\b|瑜伽|羽毛球|游泳|拳击|体态/,
  },
  {
    l1: "生活",
    l2: "骑行",
    strong:
      /自行车|公路车|山地车|折叠车|小轮车|骑行|单车|环法|禧玛诺|变速|车架/,
  },
  {
    l1: "生活",
    l2: "旅行户外",
    strong:
      /旅行|旅游|户外|探险|越野|徒步|露营|自驾|景点|环球|环游|穷游|房车|签证|出国|citywalk|逛吃|自由行|(地图|城市|出行|景点)版?攻略/,
    exclude: /环球(档案|秘闻|时报|网|影城)/,
  },
  {
    l1: "生活",
    l2: "健康",
    strong:
      /健康|医学|医生|医师|养生|疾病|睡眠|中医|营养|降压|康复|脊椎|药物|副作用|眼科|视力|近视|眼睛|牙科|牙齿|皮肤科|医院|体检|癌症|肿瘤|剖宫产/,
    exclude: /赤脚医生|宠物医生|兽医/,
  },
  {
    l1: "生活",
    l2: "宠物",
    strong:
      /宠物|猫咪|狗狗|萌宠|养猫|养狗|猫仆|喵星人|汪星人|爬宠|兽医|田园犬|柯基|柴犬|布偶猫|橘猫|鹦鹉|仓鼠|救助(流浪)?[猫狗]|流浪[猫狗]/,
    medium: /动物|小狗|小猫/,
    exclude: /电子宠物|桌宠|桌面宠物|动物学|野生动物|动物世界|古生物/,
  },
  {
    l1: "生活",
    l2: "时尚美妆",
    strong: /穿搭|美妆|护肤|时尚|发型|化妆|服装|ootd|单品|鞋子|球鞋/,
  },
  {
    l1: "生活",
    l2: "家居",
    strong:
      /家居|装修|收纳|租房|户型|家电|家具|床垫|实木|全屋定制|软装|硬装|沙发|卫浴/,
  },
  {
    l1: "生活",
    l2: "三农园艺",
    strong:
      /三农|种地|农民|养殖|果园|农业|种植|园艺|嫁接|大棚|绿植|盆栽|多肉|种菜/,
    medium: /农村|乡村|田园(?!犬)/,
  },
  {
    l1: "生活",
    l2: "钓鱼",
    strong: /钓鱼|路亚|垂钓|野钓|鱼竿|渔具|打窝|海钓|筏钓/,
    exclude: /钓鱼(攻击|网站|邮件|链接|执法)/,
  },
  {
    l1: "生活",
    l2: "育儿",
    strong: /育儿|母婴|带娃|亲子|早教|孕期|辅食|宝妈|奶爸|新生儿/,
    medium: /宝宝|孩子/,
  },
  {
    l1: "生活",
    l2: "情感",
    strong: /情感|恋爱|婚姻|分手|相亲|脱单|两性|挽回|出轨|离婚/,
  },
  {
    l1: "生活",
    l2: "日常",
    strong: /\bvlog\b|日常/,
    weak: /生活|记录|分享/,
  },

  // 娱乐
  {
    l1: "娱乐",
    l2: "游戏",
    strong:
      /游戏|电竞|steam|原神|王者荣耀|英雄联盟|\blol\b|minecraft|我的世界|单机|手游|黑神话|实况|通关|三角洲|诺手|上分/,
    medium: /攻略/,
    exclude:
      /游戏开发|独立游戏|开发游戏|做游戏|开发.{0,20}游戏|游戏行业|旅游|旅行|citywalk|逛吃|实习攻略|游戏本|游戏手机|游戏显示器|游戏鼠标|游戏耳机/,
  },
  {
    l1: "娱乐",
    l2: "音乐",
    strong:
      /音乐|翻唱|演奏|钢琴|吉他|说唱|歌曲|乐队|\bmv\b|乐理|编曲|唱歌|声乐|作曲|音乐人|歌手|网易云|qq音乐|歌单|指弹|扫弦|古典乐|rapper/,
    medium: /改编|名曲|suno|纯音乐|原创曲/,
  },
  {
    l1: "娱乐",
    l2: "影视",
    strong: /电影|影视|电视剧|影评|剧集|美剧|日剧|韩剧|追剧|恐怖片|漫威/,
    medium: /解说/,
  },
  {
    l1: "娱乐",
    l2: "动画",
    strong: /番剧|动漫|国创|二次元|新番|声优/,
    medium: /动画/,
    exclude:
      /ai动画|动画(拆解|讲解|演示|科普|解释|原理)|(形象|科普|原理|演示|讲解|教学)动画|一看就懂/,
  },
  {
    l1: "娱乐",
    l2: "搞笑综艺",
    strong: /搞笑|鬼畜|整活|综艺|真人秀|脱口秀|相声|小品|段子|沙雕|明星/,
    medium: /挑战|整蛊|恶搞/,
  },
  {
    l1: "娱乐",
    l2: "舞蹈",
    strong: /舞蹈|宅舞|编舞|街舞/,
  },
  {
    l1: "娱乐",
    l2: "虚拟主播",
    strong: /vtuber|虚拟主播|\bvup\b|\bvtb\b|皮套|虚拟偶像/,
  },
];

function hitScore(rule: TaxonomyRule, text: string): number {
  if (rule.exclude?.test(text)) return 0;
  if (rule.strong.test(text)) return 3;
  if (rule.medium?.test(text)) return 2;
  if (rule.weak?.test(text)) return 1;
  return 0;
}

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function scoreEvidence(evidence: Evidence[]): TaxonomyMatch | null {
  const l2Scores = new Map<string, number>();
  const l1Scores = new Map<string, number>();
  const l1Support = new Map<string, number>();
  for (const { text, weight } of evidence) {
    if (!text) continue;
    const normalized = normalize(text);
    const hitL1 = new Set<string>();
    for (const rule of RULES) {
      const hit = hitScore(rule, normalized);
      if (!hit) continue;
      const key = `${rule.l1}/${rule.l2}`;
      l2Scores.set(key, (l2Scores.get(key) ?? 0) + hit * weight);
      hitL1.add(rule.l1);
    }
    for (const l1 of hitL1) l1Support.set(l1, (l1Support.get(l1) ?? 0) + 1);
  }
  if (l2Scores.size === 0) return null;

  // 一级分类按其下最好的二级 + 其余二级的一半算，避免一个泛词刷满一级
  const byL1 = new Map<string, number[]>();
  for (const [key, score] of l2Scores) {
    const l1 = key.slice(0, key.indexOf("/"));
    byL1.set(l1, [...(byL1.get(l1) ?? []), score]);
  }
  for (const [l1, scores] of byL1) {
    const sorted = scores.sort((a, b) => b - a);
    const total = sorted[0] + sorted.slice(1).reduce((s, v) => s + v / 2, 0);
    l1Scores.set(l1, total);
  }

  const rankedL1 = [...l1Scores].sort((a, b) => b[1] - a[1]);
  const [bestL1, bestL1Score] = rankedL1[0];
  const runnerUp = rankedL1[1]?.[1] ?? 0;
  const bestL2 = [...l2Scores]
    .filter(([key]) => key.startsWith(`${bestL1}/`))
    .sort((a, b) => b[1] - a[1])[0];
  return {
    l1: bestL1,
    l2: bestL2[0].slice(bestL1.length + 1),
    score: bestL1Score,
    runnerUp,
    support: l1Support.get(bestL1) ?? 0,
  };
}

/** 置信：总分够高且明显领先第二名 */
export function isConfident(match: TaxonomyMatch | null, minScore: number) {
  if (!match || match.score < minScore) return false;
  return match.runnerUp === 0 || match.score >= match.runnerUp * 1.4;
}

export const SUGGESTED_L1 = [
  "计算机",
  "AI",
  "技能",
  "科技",
  "学习",
  "人文社科",
  "财经商业",
  "生活",
  "娱乐",
];

export function taxonomyTree(): Array<{ name: string; children: string[] }> {
  return SUGGESTED_L1.map((l1) => ({
    name: l1,
    children: RULES.filter((rule) => rule.l1 === l1).map((rule) => rule.l2),
  }));
}

export function suggestedTreeText(): string[] {
  return SUGGESTED_L1.map((l1) => {
    const l2s = RULES.filter((rule) => rule.l1 === l1).map((rule) => rule.l2);
    return `- ${l1}：${l2s.join("、")}`;
  });
}
