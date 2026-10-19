# T1302 新包实际界面复验

本轮既定三类候选复验实际 **3 PASS / 0 FAIL / 0 SKIP，六个普通/窄屏检查通过**。两个真实文章 source 的全部14个有序文本块与四行 `______`，分别在 native 预览及原 HTML 下载保留，无新增字面 strong/span。原 T1302-ACC-001 的坏正文未在本新包样本出现。当前交付供 R 独立验收；没有自行关闭发现、stepdone 或签父矩阵。

大白话：现在打开先看成稿，原来的字段和来源展开后仍可阅读；四行空白练习卡在预览和原下载里都是原字与六个下划线，没有把 HTML 标签印进正文。

![新包窄屏文章四行位于完整视口，保留标题、关闭和导出上下文](attempt02-approved-browser/narrow-editor-article-four-lines-viewport.png)

## 环境与执行事实

| 项目 | 当场绑定 |
| --- | --- |
| 不可变 source | `dc46cfa700ec9c9cbada47fb76237d0b50d10a67` |
| 控制 HEAD | `b42967d2ec100860b70c2b0509745e332bf16fad`，开工 status 干净 |
| 实际端点 | `http://127.0.0.1:65353`，仅本 fresh owned candidate |
| candidate binding / driver | `docs/verification/t1307/acceptance/candidate/`；各族 `*-binding.json` 保存 SHA |
| packet SHA | `4956c16b3cdd4da8f07997223d1c0b0c071d6956ca0844146f522f7e1b830d33` |
| A 控制交接 SHA | `bc64e8e0efe9c259b1f83adec45133cd6beb0fd421c9ef78338403412d5f8363` |
| B 真实业务 HANDOFF SHA | `ec80c73261c08f9362d77fabd3e508cab5879f050f29e0425a32974361513e15` |
| 浏览器 | 原候选 driver / Playwright，临时 persistent Chromium；每族 fresh context，未复制 B 业务 storage |
| 实际视口 | 普通1366×900；窄屏1024×700；未设置 CSS zoom、裁剪或更改页面样式 |
| 正常执行 | attempt02 自然 exit0，22.883499秒；worker1、retry0 |

attempt01 在沙盒内发生两个相同 Chromium launch SIGABRT / kill EPERM，尚未导航，按 packet 两次障碍停止；自然 exit1、5.223393秒、秘密扫描0。原命令/日志/result/artifacts和当轮 runner 已冻结于 `attempt01-sandbox-browser-launch/`，不是产品 UI 失败，也未覆盖。Root 随后批准与 B 相同的正常 `exec_command require_escalated` 浏览器路径，工具审批通过后才执行独立 attempt02。没有更换业务协议/数据或停启 controller。

## 三类候选与六个实际检查

| 真实候选 | 普通 / 窄屏实际结果 | 来源及交付 |
| --- | --- | --- |
| creation 文章 | 两视口chips0、文章placeholder/原aria正确；上下文、附件、发送提示及实际清空保留；默认折叠；Enter/Tab/Shift-Tab/Esc、内层关闭返回trigger、未发送输入与重开选择保留 | 原脚本保存版本引用可读；source→预览与原HTML分别核正文保真 |
| creation 图文 | 两视口chips0、图文placeholder/原aria正确；同原输入控件；默认折叠；展开来源与关开、键盘焦点均通过 | 原脚本保存版本引用可读；真实菜单仅当前页复制/下载，无HTML；未扩测PNG/ZIP导出 |
| editor 文章 | 两视口chips0、文章placeholder/原aria正确；原输入/清空保留；默认折叠；展开/收起/重开、焦点与未发送输入通过 | fresh普通首开前本候选source0，开预览才读source及原精确版本；两视口真实预览保真，普通原HTML下载通过 |

当前真实引用为 `project_script`，界面显示“引用 / 脚本保存版本 / 未提供可读名称”，没有 raw script ID/toolCallId 或 JSON 淹没。两篇文章实际 facts0、metadataSource空，没有冒称本样本覆盖其它来源族或非空事实。来源身份来自原公共 `ai.workCandidates.source`，没有伪source、预存base或重绑请求。

原 editor lazy 的证据见 `ordinary-editor-article-before-preview-requests.json`（0）及 `ordinary-editor-article-preview-requests.json`（同真实source、原`articles.versions.get`各一）。本用例为核正文另发的只读 source RPC 在该窗口之后；窄屏前的计数是同case累积，包含普通核验，不把它误记为新挂载预取。creation 两member保留原fresh/eager行为，不要求它遵守editor lazy；原请求明细逐项保留，不称全族请求去重或单在途性能均已验。

## fresh context 状态与诊断字段校正

本轮没有 B 标签页的 FrozenAdoption/sessionStorage，服务端已采纳不等于 A 必须显示本地confirmed。三族metadata标题/摘要/标签按实际字段仍可选择，无confirmed/待核对文案；没有注入 B 记录、解锁或再次采纳。

原 `*-result.json` 的 `locked` 只是 runner 用“任一checkbox.disabled”计算的粗诊断：editor文章的空facts替换单控件原本disabled，因此raw值true；同时标题、摘要checkbox实际enabled。**该raw值不能证明整卡locked/confirmed，也不是新产品缺陷。** 原观测值和执行runner完整保留，最终摘要逐控件列出，不事后改原结果冒精准状态。B同context采纳/自然reload确认属于B原证据，本轮不代签。

本轮只开关选择区、保原选项状态，没有为测试强改默认、发出采用body/key或保存。字段空值/defaults/body-key和locked完整组合按下述准确受控范围引用。

## 两source分别对正文与原HTML

| 来源 | 实际身份 | 原HTML bytes / SHA256 |
| --- | --- | --- |
| creation文章 | conversation `ai-conv-bcda7005-107`；source message `ai-msg-bcda7005-108`；tool `call_faae7b3a99d94cc4b4585a34ffda3dc9` | 9873；`e594e71c279b0ae0bd7476d125fb1684b8bc0feee6f7d8515ca8a660d31d2cb8` |
| editor文章 | conversation `ai-conv-bcda7005-361`；source message `ai-msg-bcda7005-362`；tool `call_0c6a5f169d58445b8ff4e6bdab2708d8` | 9855；`19f844fe4fb1345374545c130d3220c11f5fa7cb95ece20f898222e5c3ec5b77` |

两source均4节、14个有序文本块；各自普通与窄屏 native DOM 对本 source 的标题、节标题、各正文块按顺序核验，四行原文与每处六个下划线完整，无新增可见`<strong>`/`<span>`。独立 markdown-it 只解释source合法格式，分析副本仅去空白；原source和下载不改。不是把两份坏输出互比后宣称保真。

普通视口各通过原 MoreExport→导出HTML→原native export/Blob/download，download.failure=null。两下载随后分别再对本source核14块及四行，最后核预览/导出全文去空白相等和h1–h6/p/li有序块相等。两SHA也分别与B本候选原下载相同，不通过保存把两篇文章变成同一版本；creation为原历史候选，当前文章有后续editor版本是正常事实。

两source nativeLayout均null，主题实测graphite-minimal，预览模板占位0；显式nativeLayout没有本轮公共样本。图文不造HTML入口，未用文章下载替图文图片专项验收。

## 完整视口与逐图自检

共保存38张原PNG；执行者实际查看19张，逐张路径/SHA在 `VISUAL_SELF_CHECK.json`。每一类型、每一视口均实际看了代表画面；并查看了两文章×两视口全部四行图。这是执行者自检，**不是独立oil评审，不打分，也不冒已看全部38图**。

| 视口/类型 | 实际查看代表图及结论 |
| --- | --- |
| 普通creation文章 | assistant、default-collapsed、four-lines：侧栏原上下文/输入保留，modal标题/关闭/折叠区和导出控件完整，四行在y529–643清楚可见 |
| 窄屏creation文章 | assistant、default-collapsed、four-lines：原移动编导入口与覆盖层正常；modal内容可滚，四行在y454–568完整可见 |
| 普通creation图文 | assistant、default-collapsed、readable-source-expanded：成稿先见，原字段和可读来源展开后清晰；图文默认卡片没有被文章布局替代 |
| 窄屏creation图文 | assistant、default-collapsed、readable-source-expanded：标题/关闭/折叠/导出可达，展开区需正常内部滚动，不出现无法关闭的遮蔽 |
| 普通editor文章 | assistant、readable-source-expanded、four-lines：候选摘要与输入保留；空事实替换禁用状态真实，四行及正文正常 |
| 窄屏editor文章 | default-collapsed、readable-source-expanded、four-lines、after-inner-Escape：四行完整，关闭内层后原编导仍在且焦点返回trigger，未发送原话保留 |

这些图片全部是`page.screenshot(fullPage:false)`，无clip、无元素截图、无CSS修改。默认及四行截图里标题、关闭、折叠、导出上下文同时存在；先前B长article元素截图顶部约500px空白没有重现。结合本轮block/scroller真实rect记录，支持此前是长元素screenshot与嵌套scroll取证方式导致，当前两真实文章未见相应布局阻断；不将此扩成全应用布局或所有状态无问题。

普通creation文章assistant首图中，左侧当前稿原生编辑器还在瞬态加载，后续editor侧栏及候选已实际就绪。本轮不把该瞬态当持续产品故障，也不拿它签Tab性能。原1366侧栏header的次要截断不在本轮改版范围，不建立美学hard-fail。

Root另实际看四张本轮图：ordinary creation文章默认折叠、narrow editor文章默认折叠、ordinary图文assistant、narrow editor四行；其反馈为四图未见新明显布局阻断。此反馈只限这四图，最终其它视觉和操作仍交R独评。

## 不变量、复用与限制

三族各完整article DTO、graphic DTO、script `artifacts.get` metadata及真实total分页全部3 versions前后逐字相同，SHA均为 `406583b75c12c9420ed57c9b47257f1b253c429eb66e01b2eb32bf91415a9891`。0新模型、0成稿/脚本保存、0禁止写入尝试；两下载未触发业务保存。禁止写guard与网络原件见各 `*-network.json`，不以拦截成功冒合法产品操作成功。

`CONTROLLED_EVIDENCE_REUSE.json` 逐提交SHA证明两card、NoteRelay wrapper、projection、LazyDisclosure与StageChatWrapper六文件从旧cfbaf到新dc46逐字不变。因此原合法字段/defaults/refs/body-key和显式layout完整传参证据可在其受控边界引用；旧native bundle已变，渲染/主题转引用T1307本轮17项受控回归；AI history生命周期已变，转引用T1308当前153/216受控及B新公共三对照。不把旧完整suite叫新包重跑。

本轮实际普通/窄屏焦点通过；未新测真实浏览器菜单200%。旧T1304已审真实200%与嵌套键盘保原source范围，不整体迁作新包PASS，也没用CSS zoom冒充。loading/error/pending恢复沿未变card/旧专项及B对应证据引用，本轮未注入新故障或复制业务storage。

`TIMEOUT_REUSE.json` 绑定B本dc46完整timeout真实exit0/log SHA。A新增docs runner不声称被该旧扫描覆盖，独立预算为case1800000ms、action/expect/screenshot120000、navigation300000、launch180000、RPC900000、外层86400秒、worker1/retry0，覆盖全部串行与清理。未无理由重复原大suite。当前没有正文增量/FEEDBACK或性能测时结论。

三个context均由fixture finally正常关闭，runner自然exit0；controller94030未触碰。没有改产品/测试/旧报告、task状态或父矩阵，没有commit、安装、发布、现用App/用户库/Keychain操作。首轮沙盒失败与本轮raw诊断限度均保留，秘密精确扫描0。冻结索引及HANDOFF后释放repo/browser活动，交R独评。
