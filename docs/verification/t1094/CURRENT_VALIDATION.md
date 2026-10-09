# T1094 当前验证

修复已有部分完成任务的公开查询：真实 `partial` 沿原严格合同返回；缺少可信候选的旧卡片停止等待、保留原内容，不能自动采纳或再发任务。SPEC 正式复审 `5d2c91b81b45`，实施独立复核 `PASS_LOCAL_IMPLEMENTATION`，没有签全功能通过。

实际 RED/GREEN：公共 submit→claim→账本→completion→transport 严格 get/list 两例通过，同键回放与跨归属拒绝保持。新增卡片 11 例、文章/知识库/日报三个 partial 回归均通过；primitives 六例、三端类型、boundary/semantic/orphan 通过；LED-047 八文件 174 例通过。原 production probe 八例通过，另补真实隔离 PG 原并发用例一例通过（其它八例按名称过滤，不冒充重复执行）。原生剪辑输入/采用门没有扩展。

正式扩大前端 124 PASS/9 FAIL、后端 111 PASS/6 FAIL，退出码仍为 1。detached 原 HEAD `770037`、原文件和相同依赖分别复现相同九/六条失败；新断言通过不能洗掉旧失败，登记 T1096 进一步核对，见 [相关基线](RELATED_BASELINE_DIAGNOSIS.md)。T1093 新测试跨模块夹具门卫错误已通过正式 AiService 接线修正，11 PASS、无新增 boundary。

局部真实组件渲染已操作并查看四张截图：1280、390 窄窗口和 200% 缩放没有横向溢出；三张卡片明确显示部分完成、实际 manifest 摘要可见，七秒只读取原任务一次，停止转圈且不出现新的生成/采纳入口。使用原 tokens 与 14px 状态文案。此证明是 Vite/React 的真实组件及显式只读 client 替身，不代签安装版原生 GUI、供应商模型或真实素材编辑。临时两服务器已温和停止、baseline worktree 原依赖符号链接移除后无 force 清理。

安装前公开 CLI 再次读取原 `ai-task-434be109-200`：get 与项目列表均因六态 enum 返回 HTTP400，原会话两条消息、一个结果完整可读；未发送模型任务。新包尚未构建，安装后必须用同一 ID 再读取并比较消息/结果原字节、重启保持和原键，不重新生成联合候选。

本轮完整 reconcile 已实际结束：exit1、980.162秒，42错误/0告警；原日志 SHA256 5a7dc597bbef244902c857fc708f2a8e4fbfe10583fb9d46624d709b7079ea5a，与T1091原42项日志逐字相同，没有新增失败，T1093测试夹具造成的新增两项门卫错误已消失。pmem同步已实际exit0。16产品文件与独评时零漂移。相关15条正式Gate仍exit1，不task complete，也不写全仓PASS。所有当场命令、退出码、日志 SHA 和截图证据在 [evidence.json](evidence.json)；私有原件位于 `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1094`。T1093 的真实 Pi 联合候选缺口/T1095、平台实操、原生播放导出及全仓欠债仍保留。
