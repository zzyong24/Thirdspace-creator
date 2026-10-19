# T1302 新候选独立最终验收

**PASS，限本新 candidate 的 T1302 复验范围；无开放 issue。** 新的三类真实候选、六个普通/窄视口旅程支持正文优先、折叠选择、可读来源与原键盘交互；两真实文章分别对原 source 的全文和四行横线均保真。旧 `T1302-ACC-001` 在本新证据中已解决，旧报告仍保持 FAIL。本次T1302最终验收由当前六视口、当前B真实候选采纳、逐字未变组件的受控/旧200%对应证据共同覆盖；不称新200%重跑。此报告不代 task complete、父矩阵或原生壳验收。

大白话：先看成稿，需要时展开原选择；原稿的字、换行和四行空白在预览与下载里都留下来了。

![本R实际查看的新包窄屏四行与完整弹窗上下文](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1302/acceptance/runs/final-t1307-t1308/a/attempt02-approved-browser/narrow-editor-article-four-lines-viewport.png)

| 绑定 | 核对结果 |
| --- | --- |
| 冻结 source | `dc46cfa700ec9c9cbada47fb76237d0b50d10a67` |
| candidate / A 执行控制 HEAD | `354786143377c58a12876731d00b075c4008a858` / `b42967d2ec100860b70c2b0509745e332bf16fad` |
| 实际端点 / fresh root | `http://127.0.0.1:65353` / `/private/tmp/t1300-candidate-MhP4pW` |
| candidate-binding SHA | `d82fcbe6bbccae7f99197a0ce20deb3bd2520c459dded17e6f322f13dcf859e5` |
| 254 项索引 | `a2a540b16ff183402c0e75a7883a15b16aefb9e435339ad2abe4a29d8fb57549`；全部 bytes/SHA 匹配 |
| A 报告 / HANDOFF SHA | `97403080adf86859d36b41ae136203ebc9699a734c63f11a4e8ec379beef8c21` / `e68c207e8dc367292631310957947fa812c3e589d5994fe8ba53e0b96f0b2cf2` |

评审者 `/root/sol_initial_review_t1307_t1308`，Sol/high homogeneous 独评，不声称跨模型或已核服务档位。按 BACKLOG、T1302 SPEC/refinement delta、项目记忆、product-to-code-orchestrator 3.29.0、oil-ui-pro 0.10.0 和账号组 UI 规范评审。阶段为 acceptance，权限只有本两报告；未运行控制命令、产品测试、HTTP/RPC、模型、浏览器、构建或服务。

**实际视觉与操作。** 本R实际看21张原完整 viewport PNG：三族×两视口六张默认折叠、六张来源展开、两文章×两视口四张四行正文、四张侧栏及一张内层关闭回焦点；逐图 SHA 在同名 JSON。三族普通1366×900、窄1024×700均正文优先，标题/关闭/选择/导出入口保留，展开原字段及“脚本保存版本 / 未提供可读名称”可读；原 facts0 如实显示，没有 raw ID/JSON。四张四行图同时保留弹窗上下文，未见 B 长元素截图的上方大块空白；这里只确认这些真实画面，不能据此推导全应用布局无问题。侧栏原次要标题截断不在此次精简范围，不新造美学阻断。

实际操作由冻结 runner 的原断言、DOM/ARIA、焦点与选项记录支持，图片不单独证明键盘：六次 chips0、对应placeholder/原aria、原上下文/附件/发送提示、真实清空与未发送输入保留；Enter打开并展开/折叠，Tab/Shift+Tab留在内层，Esc关闭内层回原trigger并保原输入，重开checked状态相同；窄屏外层Esc再回“打开编导”，宽屏保持外栏。原选择区children卸载未丢卡上状态。

**source 与交付各自核对。** A source 与同 candidate B 原 source 深相等。R另以离线 HTMLParser 解析四份 native DOM 和两份原下载，对各 source 的9个正文段、5个标题逐字及顺序比较，并把原BR还原换行：全部相等；四行每处六下划线完整，无新增可见 strong/span。不是把两份坏输出互比。普通原 MoreExport→HTML/Blob/download 两次成功，未清洗下载：creation 9873 bytes / `e594e71c279b0ae0bd7476d125fb1684b8bc0feee6f7d8515ca8a660d31d2cb8`；editor 9855 bytes / `19f844fe4fb1345374545c130d3220c11f5fa7cb95ece20f898222e5c3ec5b77`。两篇不同候选版本均分别对本 source，未通过重保存换base。

普通 editor 打开预览前本候选 source请求0；打开后实际 source和原`articles.versions.get`各一。A随后的正文只读核验不冒首次预取；窄屏记录为同case累计，creation继续原eager行为，不套editor lazy约束。

**真实状态与隔离。** 三族新 context 未复制 B 业务 sessionStorage。服务端已采纳不等于新 context 本地confirmed；标题/摘要/标签字段实际enabled且无confirmed文案。editor 原 `locked=true` 是“任一checkbox禁用”的粗诊断，来自空facts单控件disabled，不能签整卡锁定；原件保留，最终摘要已准确解释。六case键盘断言没有因该字段跳过。本轮未改默认、未提交adopt body/key或再次保存；B同context真实采纳/reload仅精确引用B已审原证据。

每族原 before/after 完整 article、graphic DTO、script metadata及按total穷尽的全部3 versions（1页、3唯一ID）深相等，序列化SHA均 `406583b75c12c9420ed57c9b47257f1b253c429eb66e01b2eb32bf91415a9891`。网络原件无新模型/保存，禁止尝试数组为空，未用guard拦截来冒成功。attempt02自然 exit0，3PASS/0FAIL/0SKIP/0flaky，六视口旅程；attempt01两次sandbox Chromium启动SIGABRT、exit1，第三case因maxFailures跳过，0业务，原失败未覆盖。

**严格复用与限制。** R用 git show 原字节独立核六文件从旧cfbaf至当前dc46完全相等：两card、NoteRelay wrapper、projection、LazyDisclosure、StageChatWrapper。因此合法字段/defaults/空值/ref/body-key、显式layout传参及loading/error/pending/confirmed组合仅引用原对应受控证据。本公共样本只有project_script、facts0、metadataSource空、nativeLayout=null与graphite-minimal；不冒其它来源或显式layout公共样本。native bundle与AI历史生命周期已变，分别由T1307当前17项受控回归/公共与T1308当前受控/B三顺序公共证据支撑，不称旧整套suite在本包重跑。

本轮没有新测真实 Chrome200%。旧T1304在cfbaf的真实菜单200%（CSS683×450、目标zoom2、非CSS zoom）仅按未变外层/卡/Disclosure对应键盘与布局范围引用；不冒变更后native bundle新包200%重跑。图文本轮只核实际菜单无HTML、当前页复制/下载入口可见，未新增PNG/ZIP执行；无新增FEEDBACK/TTFT结论。未声称看全38张图。

同source B原 timeout.log/exit SHA与原exit0已核；该扫描不冒覆盖A新docs runner。A实际预算case1800000ms、action/expect/screenshot120000ms、navigation300000ms、launch180000ms、RPC900000ms，外层86400s、worker1/retry0，覆盖串行与清理。原精确秘密扫描0；本R未读取/输出私有handshake值。

旧 `docs/verification/t1302/ACCEPTANCE_REVIEW.md/json` 未改，SHA分别 `1c2dc229fa86ed93c330d9ce51e6d1f39f4e3566b9a88544bd1abbeff3b8a552` / `04e2eb309d255f36505a1e2364c4f568f20a9c7083b53fde054089a99864a1ee`。本新PASS不覆盖旧真实FAIL、不补T1307 runtime RET-001/RET-002历史留存、不代父四十功能矩阵/原生App/发布安装或其它任务整体完成。

**RELEASE：** 两报告完成后释放全部普通repo写权与评审资源，交Root/C串行整合；无commit。未持有浏览器、模型或服务，controller94030始终由C独占，本R未触碰。
