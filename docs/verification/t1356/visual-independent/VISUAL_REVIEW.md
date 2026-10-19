# T-1356 独立视觉评审（最终05）

结论：**已见摘要、数据口径及失败/恢复状态的像素表达可接受；阻断问题 0 项；当前非阻断观察 1 项，另保留前轮历史观察 1 项。** 当前组、日期、数值与缺失值能分辨。200% 截图显示正文和控件能重排，但固定顶栏在部分滚动位置覆盖内容，因此不签署“200% 全页无遮挡”。本报告不代签功能 Gate。

## 证据绑定与方法

- 输入清单：`docs/verification/t1356/review/VISUAL_ATTEMPT05_INPUTS.json`。
- 当前受验 source：`d8ea55831914cbe51afec210b6b3c1c0c8c691f3`；产品：`e511be2b204a03b168a60f014963738638865246`，均由交接提供。
- 最终05清单22张，两窗各11张。本轮实际逐张 `view_image` 15张；其余7张逐一核对SHA256，均与前轮18张已直接查看的文件完全相同，故承继精确像素证据，不伪记本轮重复看过。清单逐图区分直接查看与哈希承继，并保留完整04清单。
- 已加载项目 oil-ui-pro 0.10.0、视觉评审协议“给已有界面评审”和账号组页面规范。沿用原有丰富工作台，不探索新风格、不打分、不读实现代码或旧视觉结论。
- 最终05交接为两窗各28点completed且PASS；原有上手引导写入已精确记录/校验，不能称整页零写。此为交接的执行证据状态，评审未重跑或代签功能Gate。历史04的normal最终通用零写断言FAIL、minimum28点完成仍是当时事实，不回改为04通过。
- 生产映射由交接明确：当前source与前轮`1a9de37e4`的生产目录零diff，均对应上列产品commit；评审未读源码独立核验。
- “原生 Chrome 200%”、SQL 失败/恢复均为交接场景标识；图片像素本身不能认证浏览器缩放配置、数据库故障原因或实际操作过程。

## 逐状态审阅

| 图片状态 | 1366×900 实际可见 | 1024×680 实际可见 |
| --- | --- | --- |
| 浅色六项摘要 | 当前组“浏览与真实零值”；全部平台；2026-10-01 至 2026-10-07；六项为 1、1、0、—、—、123，标题与单位清楚 | 同组、日期与全部平台状态；六项按三列两行排列，数值与标题可读 |
| 小红书与近期累计浏览 | 平台摘要为浏览123、点赞0、账号粉丝0、平均完播率—、分享—。工作台六卡结构可见；最近发布显示“平台原有图文 / 0次浏览”；数据概览明确“暂无每日数据，先看近期作品表现”，下方标题为“近期作品累计浏览”，展示0次与最近更新时间 | 截图取景在工作台，未包含顶部小红书五项摘要；继续创作、最近发布、数据概览、创作建议可读，近期累计浏览0次、更新时间及两个复盘/采集入口可见 |
| 暗色六项摘要 | 六项 1、1、0、—、—、123；标题和正文层级可分辨 | 三列两行同值，组名、日期、平台可读；最终05的“查看历史作品”标签可辨，04的偏暗观察保留为历史NB-02 |
| 暗色工作台 | 继续创作、待办、热门选题、最近发布、数据概览、创作建议均在图中；数据概览含0次累计浏览和更新时间，恢复入口可辨 | 取景含六项摘要、前三卡与后三卡标题；未含下方完整趋势/累计浏览内容，不能由这张图声称这些内容全部在暗色最小窗口审过 |
| 交接标识 Chrome 200% 摘要 | 六摘要按两列三行重排，全部数值与标签可读；顶部平台标签部分被固定顶栏压住，见 NB-01 | 单列排列；summary-1/2补图均显示独立内容数1、期间发布记录1，标题和数值完整可读；承继SHA相同的summary-6显示后四项0、—、—、123。六项以多张滚动取景覆盖，不声称同屏完整展示 |
| 交接标识 Chrome 200% 工作台 | 卡片单列、字形清晰；热门选题、最近发布与数据概览上部可见；右上“去选题池”位置与固定顶栏重叠，见 NB-01 | 卡片单列；热门选题空态文字局部被固定顶栏盖住，最近发布0次浏览和数据概览标题清楚 |
| 交接标识 Chrome 200% 筛选操作后 | 当前组、范围说明、六个平台、小红书选中态、账号选择、日期与快捷范围完整可辨；下方浏览123、点赞0可见 | 平台条换行，小红书选中态独占下一行；组名、账号选择、日期与快捷范围未被水平裁切，主要筛选区文字可读 |
| 交接标识 SQL 失败 | 组名、2026-10-01 至 2026-10-07、小红书选中态保留；说明“平台采集摘要暂不可读，以上保留已知发布记录指标”；五项为0、0、—、—、— | 同样可见保留的筛选状态与五项值，粉丝标题换行后仍可读 |
| 交接标识 SQL 恢复 | 同组/日期/小红书；浏览123、点赞0、粉丝0、完播率—、分享—；失败说明已换为当前组读取范围说明 | 同样的筛选和123、0、0、—、—，没有文字溢出或卡片拥挤造成的阅读阻碍 |

可见数据区通过“0”和“—”区分已知零值与未知；“近期作品累计浏览”没有冒充每日新增曲线，并附“最近发布的最多5条作品”“截至各自最近更新”的口径及更新时间。这里只审其文字表达，不能证明数据来源、归属或数值准确性。

## 阻断问题

没有从本批静态证据确认到整条任务被挡住的阻断。两窗 200% 的筛选操作后画面提供了未被覆盖的完整筛选区；这只能说明该取景位置可辨认，不能替代实际点击、键盘或滚动验证。

## 非阻断观察

### NB-01：固定顶栏会覆盖滚动到其下方的局部内容

- 位置：两窗的多张滚动图，尤以 `native-chrome-200-summary-6.png` 和 `native-chrome-200-workbench-5.png` 清楚。
- 观察：正常窗口200%摘要图中搜索/通知/新建/充值盖住“公众号”“小红书”一带；工作台图中同一顶栏与热门选题右上动作重叠。最小窗口200%工作台图中，固定按钮盖住热门选题空态正文的一部分。浅色最小窗口的工作台滚动图也有类似叠压。
- 影响：相应滚动位置的局部文本与动作无法完整阅读；当前证据不能证明动作是否仍可点击，也不能证明任何滚动位置都被阻断。
- 建议：以现有顶栏/滚动容器规则处理遮挡，保证固定区域有明确背景和空间，或让相关标题/入口能停留在固定区域下方。无需改变工作台风格和结构。
- 验证：在1366×900、1024×680的100%及200%实际滚动经过平台条、热门选题标题与空态，核查内容阅读及入口操作。当前不据截图签署“200%全页无遮挡”。

### NB-02（历史04保留；最终05未复现）：暗色最小窗口的“查看历史作品”标签偏暗

- 历史位置：04的`minimum/dark-six-summary.png`上手引导右侧次按钮；04正常窗口暗色同按钮也比浅色弱。
- 历史观察：04最小窗口中按钮文字与背景的区分明显弱于旁边主按钮及其余正文。最终05两窗暗色图已经直接复看，当前同一标签清楚可辨，未复现该偏暗状态；05图与04对应暗色图SHA不同。没有据此推断产品样式曾被修改。
- 影响：次要历史作品入口的辨识度偏低；没有证据说明这是活动态还是合法禁用态，故不据像素判定功能错误或硬性对比度违规。
- 建议：先确认该状态是否应可操作；如果可操作，使用现有暗色次按钮 token 增强文字辨识度。如果确实禁用，不用为本轮主观美化扩改。
- 验证：按实际启用/禁用状态复看暗色最小窗口，必要时测量实际前景/背景对比度。

## 文案与细节记录

- 无本轮必须直接删除的文字。累计口径、未归属条数、失败保留口径、更新时间与恢复入口都有信息作用。
- 本轮不改产品，因此没有删除文案或修正样式，也没有把偏好转换成新的设计要求。
- 六摘要与平台五指标的差异直接按像素记录；不会因失败截图文件名含“six-cards”就宣称该图展示六项摘要。
- 未评审截图之外的长内容、权限、所有平台状态；未亲手操作、验证真实 Chrome 设置、测量对比度或执行键盘/焦点/滚动走查。没有给出保存、发布、采集、真实SQL恢复、零写或后台归属的通过结论。

## 实际图像

正常六摘要：

![正常六摘要](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-normal/six-summary-original-five-plus-browse.png)

最小窗口交接标识 Chrome 200% 筛选区：

![最小窗口200筛选区](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1356/candidate-attempt05/artifacts/t1356-collected-metrics-T1-00e84-d采集经真实Next与首页同scope、日期与累计语义-t1356-minimum/native-chrome-200-filter-operated.png)

## 04与最终05的证据关系

- 04：source `1a9de37e4`；18张全部由本评审逐张直接查看。当时记录阻断0、NB-01顶栏遮挡及NB-02暗色按钮偏暗；normal末尾通用零写断言FAIL为当时交接边界。
- 05：source `d8ea55831914cbe51afec210b6b3c1c0c8c691f3`；22张中15张本轮直接查看、7张通过相同SHA承继04已见像素。当前NB-01仍存在；NB-02未在本轮暗色图复现，保留历史记录，不冒充代码修复。
- 补图关闭了“最小窗口200%前两项摘要未见”的取景缺口；没有关闭实际滚动走查、真实浏览器缩放配置、对比度测量或所有平台采集恢复的验证边界。

## 最终05逐图哈希与查看方式

| 窗口 | 文件 | 查看方式 | SHA256 |
| --- | --- | --- | --- |
| normal | six-summary-original-five-plus-browse.png | 与04已见图同SHA承继 | `3fa4f0f8a5055f12d879e4239b7813bf54f88c5a50f2ea7adfb8c24f7f47175e` |
| normal | xhs-123-known-zero-recent-browse.png | 本轮直接view_image | `4000c6cd3034073286e3cc91251cd831ad7716543400a581595ffbd5b4654a23` |
| normal | dark-six-summary.png | 本轮直接view_image | `b309e493bac07ca25170c4eaf6721e5690744a9527d707d7cd4629e61cb553e9` |
| normal | dark-workbench-5.png | 本轮直接view_image | `2315b03dbead9a55b7a89dcce81fb3de2b8419c38912fb6ed89e70e94016a8eb` |
| normal | native-chrome-200-summary-1.png | 本轮直接view_image | `f5138e9f9e2efd160c2b79fefad8824179f01f99588649a2066e86215960bdc6` |
| normal | native-chrome-200-summary-2.png | 本轮直接view_image | `f5138e9f9e2efd160c2b79fefad8824179f01f99588649a2066e86215960bdc6` |
| normal | native-chrome-200-summary-6.png | 与04已见图同SHA承继 | `f5138e9f9e2efd160c2b79fefad8824179f01f99588649a2066e86215960bdc6` |
| normal | native-chrome-200-workbench-5.png | 与04已见图同SHA承继 | `8086c5c7d8712c5c096a1ccacb6d535063fbdba88c41bba8b899612da2d154eb` |
| normal | native-chrome-200-filter-operated.png | 本轮直接view_image | `4502128958c96038cb610734f68ce6df9f5c41d5d6abd77b7f097c6c8e16da31` |
| normal | real-summary-sql-failure-retains-legacy-and-six-cards.png | 本轮直接view_image | `fd5da5ffb98516f5ff15f2b34fd80752253410a5f12ae54386d6627429cff25e` |
| normal | same-scope-sql-restored-123.png | 本轮直接view_image | `90aba6817bf6c5e58785ca76843de5b12442330ea37448cb96e1dd27b31eaf17` |
| minimum | six-summary-original-five-plus-browse.png | 与04已见图同SHA承继 | `abf7ab06350dc4b478f3e8484b7c238b0cb71896e08e7f2af0a3a8d03c2d7fdc` |
| minimum | xhs-123-known-zero-recent-browse.png | 本轮直接view_image | `60236f19bd673ad7c1fab9ebdca58fb1d175ffefd122785919f1d788e6081dd6` |
| minimum | dark-six-summary.png | 本轮直接view_image | `043df7522fe0a092cd8b0d737f2cd5539877a8ea87423ef1ab2c32fc76199fe3` |
| minimum | dark-workbench-5.png | 本轮直接view_image | `35b8a19522dae0ff636a9c4394f461a157e96e3ba12820470301cd3c4e58f2b6` |
| minimum | native-chrome-200-summary-1.png | 本轮直接view_image | `78b38bae7943868a9a56eafe069899d6a9af5afa86ea2b7f0dfc88bedadc7bc8` |
| minimum | native-chrome-200-summary-2.png | 本轮直接view_image | `78b38bae7943868a9a56eafe069899d6a9af5afa86ea2b7f0dfc88bedadc7bc8` |
| minimum | native-chrome-200-summary-6.png | 与04已见图同SHA承继 | `b245575acf1c5ddfda0dc97df52aa02f1521ecce1c38749f8f7768692c1e3c7d` |
| minimum | native-chrome-200-workbench-5.png | 与04已见图同SHA承继 | `935296a43b864c5fec568576b368605ed5692ef1f210b722c54a3e189984d905` |
| minimum | native-chrome-200-filter-operated.png | 本轮直接view_image | `cae0cdb9746b3f3fe8f29b69969f9bc32bb9500257a9f454b5e6f541a8d97166` |
| minimum | real-summary-sql-failure-retains-legacy-and-six-cards.png | 与04已见图同SHA承继 | `7483f414a3d44d428f3d15bfd607be7b3d7dfc45e4c70c8a55031b974ee70974` |
| minimum | same-scope-sql-restored-123.png | 本轮直接view_image | `ff4f15f9b21c2ac681de30106283ada3dfdc3979f242a496a04c18315416f5ae` |
