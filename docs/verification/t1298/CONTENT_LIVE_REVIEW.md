# T-1298 真实模型内容复核

当前完整真实旅程通过：四轮真实 Codex 读取、候选、采纳、精确版本和刷新均已完成。执行者按用户要求使用 GPT-6.1 Sol 高思考委派；没有开启加速选项，工具未提供 service tier 读回，故不声明已验证关闭极速。

## 已保留的真实失败

原 run `browser/runs/prepared-4969bcc1704901e7` 绑定源码 `b6ef3314f44500ab247e164bee95c1da9fde7528`，真实 Playwright 退出 1，owned 宿主正常退出 0。公众号重组、公众号校正、图文重组三轮均真实 Codex 成功，且完成候选预览、采纳、指定版本及刷新读回。第四轮图文校正尚未提交。

失败发生在 E2E 原第 136 行：1280×800 下图文重组后刷新，直接期待输入框常驻可见。实际截图与 error-context 均存在右下角“打开编导”，输入框在本地抽屉内；StageChatWrapper 按可用宽度切换抽屉，刷新后 mobileOpen 默认为 false。该次为旅程漏掉真实重开动作，没有证据表明产品入口不可用。未取消或重发原模型任务。

root 审核后，仅为测试新增从可见“打开编导”或“展开编导栏”打开助手，确认输入可见可用，填入后才确认发送可用。提交 `8dbccad6a`，不改变业务、默认抽屉状态、模型/归属/采纳/脚本隔离断言和预算。`tsc --noEmit` 退出 0；单文件 eslint 前后同为 10 个既有错误（2 个 Playwright use 被 hooks 误识别、8 个旧 any），未假报 lint 全绿。

第一次新旅程被 sandbox `listen EPERM 127.0.0.1` 阻止，未创建模型任务；日志 `logs/browser-sol-final-live-sandbox-blocked.log` 保留。仅对新 owned 测试监听申请必要提升并获准，继续使用正常宿主授权、新 PGlite 和媒体隔离目录，没有读取现用 App 数据或复制密钥。

## 采纳范围的精确解释

原公众号重组候选额外提出新 summary，采纳后 summary 仍为原项目 brief。这不是漏存证据：实际 UI 写明“正文采用这份候选；元信息与事实由你选择。未勾选项保留原稿。”；原 trace 的 articles.versions.create 请求为 `adoptionMode: assistant`、`fieldSelection: []`、`factSelection: {mode: keep}`，真实请求绑定该原 task/call/toolCall/digest。已有非空标题和摘要没有默认勾选，所以应核“候选正文＋实际字段选择投影”与保存一致，不能宣称原候选全部元信息无条件保存。

原公众号校正逐字比较通过：仅把最后一句“先把问题写清楚，再决定下一步。”替换为“下一步，先记录一个值得追问的问题。”，其他正文逐字保留。原图文重组保存文档与候选全量相等。三轮 after.current、exact.document、refreshed.current 全量相等。

## 当前完整复验结果

新 run `browser/runs/prepared-e5d626b5ff97ae2d` 绑定源码 `8dbccad6a1b359bd69cd0d43a68988b1b4d37b95`，公共命令 `node docs/verification/t1298/run-journey.cjs` 真实退出 0；Playwright 1 passed、0 failed、0 flaky、0 skipped，耗时约 4.9 分钟；owned 宿主退出 0、`userDataTouched=false`。`source-hash-after.json` 检查 4209 个源码/产物，`changed=[]`。当前 JOURNEY_CONTRACT watched 路径干净。原失败保持原样，不覆盖。

隔离见证：账号组 `grp-e0f0e303-5`；项目 `project-e0f0e303-7`；脚本 `artifact-e0f0e303-20`；公众号 `output-e0f0e303-26`；图文 `output-e0f0e303-35`。均由公共接口新建；同源 WebSocket 透传，浏览器外部来源及资金写入口拦截清单为空，正常宿主授权，没有改用 production 绕授权。

|轮次|原执行任务|采纳版本|真实结果|
|---|---|---|---|
|article-reorganize|`execution-task-de6eddd2-210c-41fc-8ca1-648ab0ef9e80`|`artifactversion-e0f0e303-138`|succeeded；预览/采纳/精确/刷新通过|
|article-correct|`execution-task-a581f7b1-edfe-42cc-8be1-c375b3473986`|`artifactversion-e0f0e303-180`|succeeded；预览/采纳/精确/刷新通过|
|graphic-reorganize|`execution-task-29f38a19-93b0-4d10-98e7-88aa6ed9623d`|`artifactversion-e0f0e303-247`|succeeded；预览/采纳/精确/刷新通过|
|graphic-correct|`execution-task-a96f8864-0dab-45fe-a734-4ce2016f9093`|`artifactversion-e0f0e303-294`|succeeded；预览/采纳/精确/刷新通过|

四组 `*-ids/task/messages/candidate/before/after/exact/refreshed.json` 全部存在；每轮真实消息的 `actualEngine=codex`、`protocolKind=codex-app-server`，包含真实 `work.editor.context` 与 `work.editor.candidate`，完整读取的原稿逐字等于 original，当前平台文档逐字段等于 before.current，目标 output 与公共保存对象相同。候选前公共读回版本没有变化，只有测试明确点击采纳后创建新版本。

公众号两轮均按实际字段选择（正文采用，非空元信息未勾选、事实 keep）机械投影后与 after.current 全量相等；图文两轮候选文档全量等于 after.current。四轮 after.current、exact.document、refreshed.current 全量相等，版本 ID 相等。两平台校正均逐字核定：仅把末句“先把问题写清楚，再决定下一步。”换为“下一步，先记录一个值得追问的问题。”，前面所有正文、其他文档字段均完全保留。机械复核结果在本 run `content-review-checks.json`。

每轮原测试完整比较脚本版本列表不变、另一平台版本和文档不变，4 次均通过。公众号先校正到新末句后，图文重组仍从原脚本组织，且公众号保持；没有反向写脚本。重组内容保留“写问题—记步骤—检查结果—保留追问”的原意，没有增加统计数据、效率承诺、外部案例或个人经历；公众号用连贯段落、图文用三步列表，符合各平台独立表达。

1280 图文重组刷新后实际点击“打开编导”，输入框可见可编辑；填入明确校正后发送按钮可用，真实第四轮任务完成。旧失败已被更正的公共旅程覆盖，没有修改产品来符合测试。

未做 ASR、图片生成、安装版/双设备或用户亲自验收；剪辑公共旅程复用 T1296 同源码证据及其限制，不在本报告扩张为重新实测。
