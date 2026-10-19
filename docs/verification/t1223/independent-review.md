# T1223 报告计数与唯一锚点前置独评

2026-10-11，只读正式 SPEC、当前 generate-gallery.mjs、现有 HTML/Markdown 和原 scenario-index。未运行生成器/Next/浏览器或修改源码、测试、控制面、索引；只新增本评审。

**精确报告修复范围准入 PASS；未签实现、真实 RED/GREEN 或功能验收。** 当前任务仍是前置候选审核。写集限 generate-gallery.mjs、E2E-GALLERY.html、E2E-CASE-INDEX.md、docs/verification/t1223/**，不改原索引、状态、截图路径/字节、测试或产品。

代码锚：SPEC SHA256 `443e5bac5a34ea1ea148fbbeb456cb1c8903110d8b418180040c7cdcd93de012`；generator SHA256 `eb268273912e0a5a60d57f9266802707d624eb99be95fdc6303a2b241062c2a3`；原 scenario-index.ndjson SHA256 `2a8039180fb68b992ffdb5ce9664a40f076c8bd8eec1562b420f7428f38b2769`。

当场独立统计原索引：345 条历史记录、224 个不同 testId、67 个 spec；251 passed、86 failed、8 timedOut，无 skipped。现 HTML 345 个 article，56 个 article 锚点名称重复；两条 3912 FAIL/3913 PASS 共用同 testId 因而 `case-<testId>` 重复，原图片路径分别指向独立旧图副本与新 PASS 图。全部非空原截图路径当前文件存在。上述为现状只读证据，不冒称已运行候选的 TDD RED。

准入要求：

- 主/分组摘要、Markdown、生成命令反馈全部用“历史运行记录数”；另列完整 testId 去重后的独立用例数与 spec 数。历史各状态必须按原每条记录统计，不做 latest-PASS 替代、过滤、合并或称“当前全部通过”。同一 testId 多次失败/通过均保留各图和原证据。
- 每条记录在原索引读入时取得固定行身份，再分组；锚点应由完整 spec/testId 加原始行序号作不碰撞编码，不能用分组后的局部序号、basename 清洗或截短哈希。最简有界唯一部分可使用原始行序号，同时用完整 spec/testId 编码作识别信息；原始索引不变时结果确定，追加记录不改旧行序号。不要把该报告行号描述成生产实体 ID。section 若需跳转，应同样避免 basename 冲突，锚点和所有对应 href 使用同一生成函数。
- HTML 原 tokens/布局保持；仅摘要与报告身份/相应跳转变更。保每条状态、标题、URL、retry、错误证据、截图路径和缺图状态，Markdown 对应记录也不能被去重删掉。若添加逐条 gallery 链接，以真实唯一锚点为目标，不造假跳转。
- 真 RED/GREEN 应在临时目录复制原生成模块，用小 NDJSON 两条同 testId 的历史记录运行原模块，实际证明重复 article ID/错误 cases 摘要；再运行候选，确认两条各自唯一可定位且图片/状态不变。临时输入不写真实 scenario-index。缺字段/空索引等边界诚实显示 0，不假造 testId/状态，坏 JSON 原解析失败不洗绿。
- 完整原索引前后字节 hash 相等、生成 article 数等于记录数、全部 article ID 唯一、去重 testId 与原统计一致、每条状态和截图路径逐行相同；不以计数相等替代逐条映射。3912 FAIL 和 3913 PASS 必须各自唯一锚点、对应原图，图片存在；若索引期间新增真实记录，则保存实际输入锚，不能硬写上述 345/224 成常量。生成结果重复运行一致，只在允许的两个派生文档输出。

该 scope 修复报告误读/重复身份，符合既有截图复核授权，不增加页面产品、业务/权限/schema 或模型/平台能力，不需额外用户许可。未继承任何 T1207/T1208 全功能 GREEN；后续真实实现 diff、TDD 和完整输出尚待审核。

## 2026-10-11 最终实现与当场证据独评

**T1223 精确报告实现及验收 PASS，无范围内阻断；不签 T1207/T1208 全功能或 T1217。** 本次只读正式 SPEC/Packet、生成器 diff、verify、原索引、RED/GREEN 日志与派生报告，实际查看两张截图。未启动 Next、触碰业务产品/测试/控制面或改原索引/历史。仅追加本评审。

本轮锚：SPEC SHA256 `443e5bac5a34ea1ea148fbbeb456cb1c8903110d8b418180040c7cdcd93de012`；Packet `c79668634b7f3ba9f3ca84c18843751a05320028a11126b1041564c29edb1d66`；生成器 `84cd7d994ace92b4404cf7050e69ecd74c8849314fb40bc3b088e499194c8535`；verify `b7680673602d037fbbfffc8d0d6bdecd07ac7cf9a6503338a8e3cd6523e7c6d8`；HTML `ca84446cece867083ff29bbf3dd7a8f06cf662f298fa75479a3c297fd601b866`；Markdown `11c82fd355f90385ee2b7ac3ee7dbeba71d1ed1db46fecbd522be342da921941`。

- 原索引仍为前评 SHA256 `2a8039180fb68b992ffdb5ce9664a40f076c8bd8eec1562b420f7428f38b2769`。本次另用 Python 从原行独立统计：345 条历史运行、224 个完整 Test ID、67 个 spec，251 passed / 86 failed / 8 timedOut / 0 skipped；345 个原图路径全部存在，HTML 全部 ID 唯一。没有用最近 PASS 代替历史状态。
- 生成器在读入原 NDJSON 时记录原行 ordinal，分组后仍保完整 spec、testId、ordinal，HTML 与 Markdown 使用同一 recordAnchor。原行序号保障每条记录唯一，完整 spec 编码也消除旧 section basename 碰撞；这只标识报告记录。原 title/URL/retry/错误/截图配对不变；摘要、分组、Markdown 与命令反馈明确历史运行及独立 Test ID。
- 原 `red-baseline.log`（SHA256 `702ca169ea12f6fa889ddf33b97491fe4a9c9520cdfb2417ff21c31e05ad03d2`）及 JSON（`818947a3f29c9aedd6b11330e65f614f5b0b264b655e079d8952741e8ccc2b63`）保留同 ID 的 3912 failed / 3913 passed 两行：旧模块实际输出两个相同 article ID 和 `2 cases`，两条新合同检查失败。其 source SHA 与本次只读 HEAD 原模块计算的 `eb268273912e0a5a60d57f9266802707d624eb99be95fdc6303a2b241062c2a3` 一致，亦与前评未改模块锚一致。此处核原当场 RED 记录，没有在实现后重造第一轮 RED 或把旧模块运行成功误说成断言通过。
- 作者 generation/verify-output 日志与 verification-result 保留实际 GREEN。另独立运行获准 verify 的临时副本：仅将副本 root 固定为真实项目路径，使输出 here 指向 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1223-independent-io8538z9`，其余断言/fixture/浏览器代码逐字保持；原 verify 与正式截图/结果未回写。命令实际 exit 0，临时 `execution.log` 与 `verification-result.json` 可查。两行 fixture 与完整索引均生成两次 HTML/Markdown 字节相等，并与正式派生文件字节相等；全部原行逐项校验身份、状态、标题、URL、retry、错误、Test ID、图路径及 Markdown 链接，索引前后哈希不变。
- 本地 file 报告浏览器实测 94 条请求全部 file，无外网，3912/3913 的原缩略图各自点击打开且真实图片 naturalWidth 大于 0。另独立检查两个 Markdown 对应 fragment：344 行 FAIL 和 345 行 PASS 的 `:target` 均精确等于各自完整 recordAnchor，命令 exit 0；不仅依靠数目或 CSS locator 声称可跳转。3912 原图仍 `../t1221/3912-fail-stable-screenshot.png`，3913 仍原 screenshots 路径。
- 实际查看原 `gallery-1024.png`（1024×768，SHA256 `fa420919be8d25a2560e20d4b2ec7deea126944966947559d3e076a43d330ebd`）与 `gallery-1536.png`（1536×960，`ca8648de320a9e768f22c17ffc63ed567c5eaa1047f73a69549066833f40f893`）：顶部真实可读“345 条历史运行记录”“224 个独立用例（按不同 Test ID 去重）”及“不表示全功能通过”，同时保留失败/超时数量和红绿卡片，不形成全绿暗示。1024 下文案自然换行，1536 下单行；标题、网格/卡片与原 tokens 保持。代码提取 `<style>` 与 HEAD 原模块比较字节完全相同。新增说明行带来的顶部高度变化属于批准文案范围，未重做布局。
- 精确写集 `git diff --check -- docs/verification/t1207/generate-gallery.mjs docs/verification/t1207/E2E-GALLERY.html docs/verification/t1207/E2E-CASE-INDEX.md docs/verification/t1223` 当场 exit 0。

报告边界足够清楚：这是既有历史证据的报告身份/计数与本地文件可读性验收，没有再次执行 224 个用例，没有消除 86 次失败或 8 次超时，也没有证明安装版、真人平台、真实模型或全部产品功能通过。原全局 Gate 债和其它任务仍按各自真实结果保留。
