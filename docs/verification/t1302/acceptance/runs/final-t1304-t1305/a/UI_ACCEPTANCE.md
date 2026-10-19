# T1302 实际 UI 验收结果

本次三个既定测试目标均通过，Playwright 自然 exit0、3 PASS / 0 FAIL / 0 SKIP，外层实际 18.435 秒。但冻结原件时发现两份文章出现真实正文标签文本渲染异常，**不能将 exit0 写成整体 UI PASS**。异常未修复，整体结论交 Root / R 独立裁决。

## 受测绑定与范围

- 控制 HEAD `ea04d65d0735f2997b592b607a1c88f9ad51a997`；不可变包 source `cfbaf1ee021ef6904440ffd78afe3f82c4381ed6`，live `http://127.0.0.1:65112`。
- packet SHA `3d093c87b08fadc70907a0ec03a50dbbf7495d2220fc8c2ce96de89619f5435e`；binding SHA `af548574f185d2ae22ea05de24fdc27bf2971283c75882eef76c9b99b1ddb7cb`；B HANDOFF SHA `273f942b79f1f94f82249f94f93edd1501df41d85563677e1baf43bedf9a4283`。
- 使用新临时 persistent Chromium profile，每族独立新 context；保原 candidateGuard 与公共 fixture。未复制 B 的业务 storage；仅绑定真实组身份。先等待初始真实 editor messages200 与候选 region 可见，再通过原历史 UI 选目标，未重复 T1306 快速切换观察。
- 仅此次两处允许证据目录有新增，生产、原 driver、控制面及旧证据均未改；无 commit、模型、成稿保存、预存基底、用户库或 Keychain 操作，原 controller 未操作。

## 当场通过的目标

| 真实族 | 侧栏与选择 | 来源与交付 |
| --- | --- | --- |
| creation 文章 | 通用 chips 0；正确文章 placeholder / aria；项目上下文、附件、清空、发送提示保留；实际清空有效；采纳选择默认折叠 | 展开后脚本版本引用可读；原 MoreExport → HTML 下载成功 |
| creation 图文 | 通用 chips 0；正确图文 placeholder / aria；原控件保留；默认折叠 | 可读引用；原菜单仅复制/下载当前页，无 HTML，本次未执行 PNG/ZIP 专项 |
| editor 文章 | 通用 chips 0；正确文章 placeholder / aria；原控件保留；默认折叠 | 展开来源可读；原 MoreExport → HTML 下载成功 |

三族均使用真实 trigger 的 Enter 打开、summary 的 Enter 展开/收起；关闭后 trigger 焦点与真实未发送输入保留。原图包括 `*-assistant-simplified.png`、`*-default-collapsed.png`、`*-readable-source-expanded.png`、`*-more-export.png` 和两个 `*-download-complete.png`。A 已实际查看文章交付、图文来源及 editor 侧栏原图；这是执行者自查，**不是独立 oil 图审**。

当前真实 refs 为脚本保存版本，显示“引用 / 脚本保存版本 / 未提供可读名称”，未泄露 raw ID 或 JSON。当前两个文章事实为 0、metadataSource 空；未编造其它来源族的 UI 样本。其它字段/refs/metadata、显式 nativeLayout 优先级及全局通用 chips 隔离沿原受控实施证据准确引用。

## 原始 HTML 下载及同文对照

| 来源 | 原件 | bytes | SHA256 |
| --- | --- | ---: | --- |
| creation 文章 | [creation-article.html](downloads/creation-article.html) | 15526 | `cfd7eb8073fd7ab5188dd7e68b0c79eedf910b67c38530bbe72e2aa312456f8f` |
| editor 文章 | [editor-article.html](downloads/editor-article.html) | 14975 | `5abf1a54aaf6498ca02282929257342db3748940d6a15f59d29ba989b16a6435` |

两次都经真实原菜单及原 native export/Blob/download 路径，download.failure 为 null。两份下载分别与自身实际 Shadow DOM 预览比对：全文折叠空白相等，h1–h6/p/li 的有序文本逐项相等，真实标题及五节标题齐全，预览和导出 `{…}` 模板占位均为 0。原下载字节未被清洗；JSDOM 仅解析分析副本、不执行脚本。实际样本 nativeLayout 均为空，主题 graphite-minimal；未通过保存把 creation、editor 或当前平台稿变成同一份正文。

**同文成立不等于正文渲染无异常。** 见下节。

## 真实正文异常：标签进入可见文本

两份真实 source 的第 5 节 body 是普通四行中文与 `______`，没有 `<strong>` 或 `<span>`。实际 native preview 的 `textContent` 却各有 3 个字面 `<strong`，包含形如 `<strong style="color:#27272A;"><span leaf="">实际试过的方法和步骤：</span></strong>` 的文本；真实下载解析后也含同样文本。这不是六个模板占位，也不来自原候选预置 HTML。

完整绑定、原 source 节点、真实 DOM 文本摘录、原文件和只读代码线索在 [literal-markup-observation.json](literal-markup-observation.json)。`projection.ts:66-69` 将 section.body 放入 markdown；`noterelay-editor.tsx:43` 交给 native load；原 `wechatRenderer.ts:535-560,641-643` 顺序处理双/单下划线并由 leaf 转义。连续下划线跨行/嵌套替换可能把先生成标签再次当正文转义；**这只是静态归因线索，尚未另跑根因实验**。

保留 `*-actual-source.json`、`*-native-preview.html`、`*-preview-content.json`、`*-html-comparison.json` 和两个原下载。已有交付 PNG 只拍到文章上方与前两节；未滚到第 5 节，因此不把这些 PNG 冒称异常局部图。第 5 节证据来自完整真实 Shadow DOM 与下载字节。没有扩大测试、清洗、修改断言或修产品来隐藏该异常。

## 不变量、预算及证据复用

三族各自完整 article DTO、graphic DTO、script metadata 与分页所有 versions 前后逐字节相同，共 3 个 script versions / 1 页。每对 SHA 均为 `39863d4966e65a3a90abc0ffaa591078c79fd7c01ea3eb9c214658fb1ba0317e`。实际 dispatch 网络中 0 新模型 / 0 成稿写，保护路由 0 次拦截尝试；原输入未发送，下载未触发业务保存。

原同 source B timeout verifier exit0 精确复用，原 log/exit/execution SHA 及当前输入不变证明在 [timeout-reuse.json](timeout-reuse.json)。新增 docs runner 不属于旧静态扫描；另核 case1800000、hook/launch180000、action/expect/screenshot120000、navigation300000、RPC900000，worker1/retry0，外层14400秒覆盖三族串行及清理。未无理由重复大 suite。

同包 B 三模型采纳/隔离、T1304 三族宽/1024/真实 Settings200%→CDPzoom2/CSS1 并恢复100%、T1305 来源三族原位恢复，分别引用其已冻结原证据与独立评审；本窗口不把那些自然 pending/confirmed 搬入新 context，也不重复验证。T1305 原首轮历史观察保留并由 T1306 另管，此窗未复现或修复。

全部 3 个临时 profile 已清理，17 张原图、2 个下载保留；私有 handshake 扫描未命中，session 未复制。精确结果在 [FINAL_SUMMARY.json](FINAL_SUMMARY.json)，原命令/预算/自然退出在 execution.json、execution-result.json、playwright.log / playwright.exit、result.json；索引见 EVIDENCE_SHA256.json。完成证据冻结后 **RELEASE 普通 writer/browser slot**，等待 R 独评；未 claim 整体完成或修改任务控制状态。
