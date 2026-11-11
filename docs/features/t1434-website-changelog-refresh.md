# T-1434 官网下载区与更新日志维护

## 用户需求与授权

2026-11-01 用户要求更新 https://creatoros.aitongban.cloud/#changelog：移除截图中置于页面顶部的旧 Mac 验收包下载区，补齐已更新的多个版本，并更新官网。授权包含该静态官网的部署。

## 范围

- 保留官网既有设计与真实产品内容；先比对线上文件，保全线上已有更新。
- 移除顶部旧 Mac 验收包整块内容，不迁移或新增未经要求的下载入口。
- 根据 GitHub releases、发布记录和提交核对版本、日期与用户可感知变化；不把源码修复、验收包或未验收能力描述为正式发布。
- 同步首页当前版本提示、版本选择器与更新日志；保留旧版记录与交互。
- 仅维护 website/index.html、必要的官网测试、本 SPEC、任务与阶段证据；不改安装包、自动更新源、模型权益或桌面代码。

## 验收与验证

1. 官网顶部不再展示截图中的验收包下载块及其下载链接。
2. 新增版本记录可追溯真实发布来源，旧版日志可正常切换，首页版本提示一致。
3. 运行官网现有测试与本次必要回归、HTML 差异检查、桌面及窄屏浏览器检查。
4. 部署前备份线上 HTML，仅替换官网 HTML，不触碰 updates、prompts 或安装包；部署后 HTTPS 回读与本地发布文件一致。
5. 执行 pmem sync、reconcile，并如实记录既有范围外欠债。

## 实现口径

这是既有静态官网的内容维护：复用线上 CR-1.5 页面，不改版本切换脚本及数据归属。用户在首次上线后于 2026-11-01 明确更正：官网使用 v1.2.0、v1.3.0 命名两批日志，不使用月份命名，并补齐多平台支持。新批次命名 v1.3.0，前一批命名 v1.2.0，首页、页尾和版本选择统一。该对外命名为用户本轮明确确认；本任务不改桌面版本、安装包与自动更新源。来源见 `docs/research/2026-11-01-website-changelog-sources.md`。

线上已撤下本地旧页面的商业入口与 FAQ，故对应两条旧断言改为检查真实线上产品导览及本次移除的下载区；金额、联系人、二维码、假按钮等原断言保留。同步线上真实图片资源，缺失的 favicon 引用改用已有 SVG。保留已有正文默认可见回归，修复线上默认隐藏样式，避免深链接或动画异常导致正文空白。

仅静态文案与内容移除，无新增确定性业务逻辑，不制造 TDD 红测；用线上旧页面的真实失败、现有测试及真实浏览器旅程验收。不扩大为桌面产品全量验证。reconcile 使用 quick/read-only 控制面对账，完整产品 lessons 与桌面验收不在本次静态站范围，不宣称已执行。

## 2026-11-01 用户追加范围

- 产品定位从仅强调抖音改为多平台创作与运营，首页、页面标题、产品说明同步。
- 多平台说明覆盖抖音、小红书、视频号、B站、快手、YouTube 与公众号；按真实创作、发布管理、账号和数据能力描述，不承诺所有平台均可全自动发布或采集。
- 版本选项仅显示 v1.3.0、v1.2.0 及既有历史版本，日期仍保留真实更新区间。
- 首次交付记录与收据保留在 Git 历史；新一轮证据写入 `docs/verification/t1434/r2/`。通过 taskctl 撤销原验收并恢复进行中，重新验证与部署。

## 第三轮：两站真实截图与SEO（用户2026-11-01明确授权）

- 用户提供14张本机真实截图，明确“两站都放真实截图，不用再脱敏”，授权公开其中账号名、内容标题与实际数据。此指令替代旧的示意图/脱敏限制；不据此读取或公开截图之外的私有数据。
- 操作者持有该14张图片，最终得到官网与购买页可访问、可放大的真实产品展示。正常路径为看功能、点图放大、返回页面、到购买页查看方案；失败恢复为关闭预览、刷新与服务端备份回滚。
- 官网替换首页和六个工作面示意图，补全十四张功能截图展示，保持v1.3.0/v1.2.0记录与顶部无下载区。
- 购买页使用同一批真实截图，保留原有套餐、价格、推荐人、购买、兑换、客服、下载与Moving页面行为。仅增加CreatorOS专属静态HTML、调整CreatorOS展示配置、增加截图样式；共享交易脚本原样保留。
- 购买页当前部署源为线上静态包，Growth工作区存在大量既有未提交改动，不能用该工作区覆盖线上。本次静态候选在本项目 `website/buy/` 保存，只部署明确的展示文件。官网通用部署脚本排除此独立购买站目录。
- SEO以品牌、AI自媒体创作、短视频脚本、小红书图文、公众号排版、多平台运营等真实功能组织title/description/H1、正文、alt与图片标题；两站各自canonical、分享预览、静态可抓取内容、结构化软件信息、robots与sitemap。不编造价格、评价、用户规模或排名保证。
- 购买页维持原CSP与API策略，只为CreatorOS专页及robots/sitemap增加精确静态路由；部署前nginx -t，失败恢复原配置及文件；不改其他产品路由、支付、数据库或下载包。
- 验证：现有官网测试；图片来源及无损转码记录；静态HTML/SEO/JSON检查；两站1440×1000和390×844真实浏览器图片、放大/关闭/返回、版本、刷新与公开内容回读；购买页仅GET验证方案和表单，不创建订单/兑换/消耗真实码；保留Moving HTML与共享脚本校验和。
- 新证据写入 `docs/verification/t1434/r3/`。纯文案、静态资源与配置不制造TDD红测；原页面不满足新截图与SEO要求的真实失败单列。pmem sync与quick/read-only reconcile不代表全产品验证。

## 官网浏览器旅程

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1434",
  "watched_paths": [
    "website/index.html",
    "website/pricing.test.mjs",
    "website/assets.test.mjs",
    "website/buy/creatoros/index.html",
    "website/buy/products/creatoros.json",
    "website/buy/assets/screenshots.css",
    "website/buy/assets/screenshots.js", "website/buy/assets/store.js",
    "website/shots/real",
    "website/robots.txt",
    "website/sitemap.xml",
    "docs/verification/t1434/verify-website.mjs",
    "docs/features/t1434-website-changelog-refresh.md"
  ],
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "download-removed",
      "test_id": "website-download-removed"
    },
    {
      "id": "versions",
      "test_id": "website-versions"
    },
    {
      "id": "keyboard-refresh",
      "test_id": "website-keyboard-refresh"
    },
    {
      "id": "responsive",
      "test_id": "website-responsive"
    },
    {
      "id": "real-screenshots",
      "test_id": "website-real-screenshots"
    },
    {
      "id": "seo",
      "test_id": "website-seo"
    },
    {
      "id": "storefront-preserved",
      "test_id": "website-storefront-preserved"
    }
  ],
  "required_conditions": [
    "refresh",
    "keyboard"
  ],
  "viewports": [
    {
      "width": 1440,
      "height": 1000
    },
    {
      "width": 390,
      "height": 844
    }
  ],
  "coherence_groups": []
}
```

## 第四轮：T1439权益与视频变更后的原旅程回归（2026-11-05）
T1439已获用户授权公开分成金额、增加视频并调整布局；599元永久版含分销与共创，月卡不含。原收据因watched_paths变化正式失效，通过taskctl重新运行截图、SEO、版本、键盘、套餐、兑换入口与刷新回归，证据写r4，保留r3历史记录。commerce只允许summary/activationNote两个展示字段随用户要求修改；其余交易配置、共享脚本、14张真实截图及SEO约束全部继续校验。

## 第五轮：两站完整宣传片上线后的既有旅程回归（2026-11-11）
T1466用户明确要求在官网和buy直接播放4分58秒完整版，替换旧短片与跳转链接。原r4收据通过taskctl正式撤销，保留旧证据；在r5重跑原14图、SEO、版本、键盘、套餐、领取入口及刷新旅程，保留所有交易配置与共享脚本断言。两站新播放器另见T1466真实播放/暂停/150秒和280秒seek检查。
