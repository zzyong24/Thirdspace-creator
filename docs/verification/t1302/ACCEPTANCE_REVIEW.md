# T1302 实际验收独立评审

**结论：FAIL。** 三项既定 Playwright 目标实际为 3 PASS / 0 FAIL / 0 SKIP、自然 exit0（外层 18.435 秒），但两篇文章的真实正文预览和 HTML 交付出现新增可见标签。T1302 不得以脚本通过代替整体验收，不缩范围、不 done；Root 已另登记 T1307 草案，尚未修复或取得修复新包。

评审者 `/root/sol_review_t1303`，独立于本轮实施/执行者，沿已读 product-to-code-orchestrator 与 oil-ui-pro 0.10.0、项目 UI_RULES；请求模型 GPT-6.1 Sol/high，不声称可读回 Fast/tier。此次只读原证据、写本两报告，未测试、浏览器操作、业务调用、模型调用、控制或提交。

## 输入绑定

| 输入 | SHA256 |
| --- | --- |
| 主 SPEC | `9ceb88d8216547f6d62ee9814fb14a8f472d949725121777db001db9f5878f57` |
| 展示 delta | `0907b3c91832a9339c92cad63e375c3a26db07f0272fd26905c6dee7cc51e210` |
| 新 run UI_ACCEPTANCE.md | `469a87bf52898bb1d9c3d15cef88119f658e70c2f065520d8f2704971a52d174` |
| 119 项 EVIDENCE_SHA256.json | `36cfe3320917e1eadcf17547866ec5d73ec5ca2b18682a189694149e78a66627` |
| literal-markup-observation.json | `3bc4686d2ce483493babeaa57e2b68ddfe5bf01fd471e7112227542a921bcd50` |

新 run 为 `acceptance/runs/final-t1304-t1305/a/`，不可变 source `cfbaf1ee021ef6904440ffd78afe3f82c4381ed6`，执行控制 HEAD `ea04d65d0735f2997b592b607a1c88f9ad51a997`。candidate binding SHA `af548574f185d2ae22ea05de24fdc27bf2971283c75882eef76c9b99b1ddb7cb`。119/119 原件 bytes 与 SHA 全匹配，含17张PNG；没有把本索引与 B/T1304/T1305 数量相加冒独立总数。

## 阻断发现 T1302-ACC-001（major）

creation 文章与 editor 文章的 `*-actual-source.json` 第5节仅有正常四行中文及 `______`，没有 `<strong>` / `<span>`。真实 `*-preview-content.json` 的 DOM `textContent` 和原始 HTML 下载解析后的正文却各包含3个字面 `<strong`，出现 `<strong style="color:#27272A;"><span leaf="">…</span></strong>`。这是生成标签成为正文，不是原候选夹带 HTML，也不是原六个模板占位。

这影响 delta 第13–15、33–35行要求的成稿正文与真实预览/交付。预览和导出相同、块序相同、模板占位0，仍可能是两份相同坏输出；现有目标断言未覆盖这项内容正确性。`wechatRenderer.ts:535–560,641–643` 的双/单下划线顺序替换及 leaf 转义提供最小调查线索，完整根因尚未经独立重放实验确定，不能冒称已修。

两份未清洗的真实下载：

- `downloads/creation-article.html`：15526 bytes，SHA `cfd7eb8073fd7ab5188dd7e68b0c79eedf910b67c38530bbe72e2aa312456f8f`。
- `downloads/editor-article.html`：14975 bytes，SHA `5abf1a54aaf6498ca02282929257342db3748940d6a15f59d29ba989b16a6435`。

原17张图未滚到第5节，不能称已有截图显示异常局部；本发现由完整真实 Shadow DOM 与下载原件证明。旧写集禁止全局清洗不能成为默许坏正文的理由，也不授权当场改 renderer。后续须经合法独立锁审的最小修复及真实原组件/新包下载复核闭合，不删除原四行或横线、不清洗原件、不改旧通过/失败记录。

## 已通过子项继续保留

三族 creation 文章、creation 图文、editor 文章实际 chips 为0，文章/图文 placeholder 与原 aria-label 正确；上下文、附件、发送提示保留，清空实际有效，未发送输入保留。真实 Enter 打开、ready 选择默认折叠、Enter 展开/收起、关闭返回原 trigger 均有实际证据。脚本保存版本 refs 的类型、数量及“未提供可读名称”可读，没有 raw ID/JSON 淹没；其它 refs、非空事实和 metadataSource 族不能冒称本样本实际覆盖。

两个文章空 nativeLayout 实际走 graphite-minimal，原菜单真实 HTML 下载成功，预览/导出同文与有序块相等、模板占位0；这些局部通过不覆盖上述正文失败。图文原菜单无 HTML 入口，不造 HTML 功能或签 PNG/ZIP 专项。显式 nativeLayout 优先、合法空值/defaults/全部 refs/body-key 等仍沿原已冻结受控实施证据，不声称本次真实样本覆盖所有组合。

三族完整 article/graphic DTO、script metadata 与全部3个 script versions 前后字节相同，SHA均为 `39863d4966e65a3a90abc0ffaa591078c79fd7c01ea3eb9c214658fb1ba0317e`；0新模型、0成稿保存、0禁止写入尝试。同 source B 采纳/恢复、T1304 三族键盘与真200%及恢复、T1305 来源恢复保各自原独立范围，不被本展示失败改写。timeout 原同 source B exit0按冻结引用复用；旧静态扫描不冒称扫描本次新 docs runner，执行预算另由原件记录。

独立实际查看三张本轮代表图：creation 文章默认折叠、creation 图文可读来源展开、editor 文章可读来源展开；正文优先及来源呈现改善成立。结合已审同 source 响应式、键盘与来源状态证据，保这些子项；不编视觉分数、不声称独立看过全部17图。正文/交付项阻断整体实际 UI/oil 验收。

T1306 历史切换仍按独立任务待核，本轮未证明已修。T1301 用户接受仅历史完整组合前RED缺证，不覆盖本失败；父矩阵、正式 App/native 壳、激活、用户库及发布均未代签。
