# T1094 当前验证

修复已有部分完成任务的公开查询：真实 `partial` 沿原严格合同返回；缺少可信候选的旧卡片停止等待、保留原内容，不能自动采纳或再发任务。SPEC 正式复审 `5d2c91b81b45`，实施独立复核 `PASS_LOCAL_IMPLEMENTATION`，没有签全功能通过。

实际 RED/GREEN：公共 submit→claim→账本→completion→transport 严格 get/list 两例通过，同键回放与跨归属拒绝保持。新增卡片 11 例、文章/知识库/日报三个 partial 回归均通过；primitives 六例、三端类型、boundary/semantic/orphan 通过；LED-047 八文件 174 例通过。原 production probe 八例通过，另补真实隔离 PG 原并发用例一例通过（其它八例按名称过滤，不冒充重复执行）。原生剪辑输入/采用门没有扩展。

正式扩大前端 124 PASS/9 FAIL、后端 111 PASS/6 FAIL，退出码仍为 1。detached 原 HEAD `770037`、原文件和相同依赖分别复现相同九/六条失败；新断言通过不能洗掉旧失败，登记 T1096 进一步核对，见 [相关基线](RELATED_BASELINE_DIAGNOSIS.md)。T1093 新测试跨模块夹具门卫错误已通过正式 AiService 接线修正，11 PASS、无新增 boundary。

局部真实组件渲染已操作并查看四张截图：1280、390 窄窗口和 200% 缩放没有横向溢出；三张卡片明确显示部分完成、实际 manifest 摘要可见，七秒只读取原任务一次，停止转圈且不出现新的生成/采纳入口。使用原 tokens 与 14px 状态文案。此证明是 Vite/React 的真实组件及显式只读 client 替身，不代签安装版原生 GUI、供应商模型或真实素材编辑。临时两服务器已温和停止、baseline worktree 原依赖符号链接移除后无 force 清理。

安装前公开 CLI 再次读取原 `ai-task-434be109-200`：get 与项目列表均因六态 enum 返回 HTTP400，原会话两条消息、一个结果完整可读；未发送模型任务。此为安装前的真实失败，原日志保留；本轮安装后与重启后的同ID验证见下，不把历史400改成PASS。

本轮完整 reconcile 已实际结束：exit1、980.162秒，42错误/0告警；原日志 SHA256 5a7dc597bbef244902c857fc708f2a8e4fbfe10583fb9d46624d709b7079ea5a，与T1091原42项日志逐字相同，没有新增失败，T1093测试夹具造成的新增两项门卫错误已消失。pmem同步已实际exit0。16产品文件与独评时零漂移。相关15条正式Gate仍exit1，不task complete，也不写全仓PASS。所有当场命令、退出码、日志 SHA 和截图证据在 [evidence.json](evidence.json)；私有原件位于 `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1094`。T1093 的真实 Pi 联合候选缺口/T1095、平台实操、原生播放导出及全仓欠债仍保留。

## 当前新包与安装验证

本地 main 源码 `e71022fff7cee5bb8b5917bba33b498e017f0133`，版本1.2.0，固定入口构建348.279秒exit0；四项打包基本测试45PASS。构建前后工作树干净，16产品+T1093测试文件无漂移。新DMG `/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`，840213865字节，SHA256 `72b7764d6f99ca739dd9a642a46f694b74d4ba7fb7d638e81942019c353deecc`。`hdiutil verify`、source/DMG应用deep strict签名检查、四个关键安装文件字节及实际编译→本轮转换策略→包内运行时均通过。本地ad-hoc，未公证。原App温和退出后正常覆盖安装，无备份、数据重置或强杀。

实际首次和正常重启均记录HTTP首页加载完成，公开CLI mode=installed、连接与原持久访问开启。外部观察脚本分别68.139/22.421秒完成，含核验和CLI读取，不能当作精确冷/热启动耗时，也不代称看过原生窗口。

新安装公开get/list原 `ai-task-434be109-200` 均成功，status/runtimeStatus真实partial，保留原两条消息及一个结果原字节。以日志里已成功提交的同一原key及完全相同payload回放，返回原message199；get/list、结果、消息数量不变，没有新模型任务。另九个原任务仍为原状态；文章、图文、原生工程与联合对象DTO均与原保存对象一致。正常重启后同样10任务、原幂等回放、原任务字段、消息/结果hash与四个业务DTO再比对全部一致。原Pi联合候选仍未成功，部分完成不能当作全成功；所有新候选未采纳。

已完成本项局部安装回读与重启证明；正式相关Gate仍保留15条旧失败，全局42项仍在，T1094不写任务全部完成。当前窗口体验已通过可选文本问题向用户核实，未收到答复时保持待验证。父全功能、原生拖拽/播放导出以及平台操作不由这10项读测试代签。

独立最终复核：[INSTALLED_FINAL_RECHECK.md](INSTALLED_FINAL_RECHECK.md)，结论 `PASS_INSTALLED_T1094_LIMITED_SCOPE`，SHA256 7f0407cca92288d4d03e5a7bb6ef314622b0acaf2c67236d52d1e9af59c2f55e。仅证明本地安装有限修复，不代签剩余Gate或全功能。实际codesign display进一步确认安装签名Signature=adhoc。
