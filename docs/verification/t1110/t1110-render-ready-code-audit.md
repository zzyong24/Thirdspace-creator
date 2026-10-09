# T-1110 延迟渲染就绪修复：只读复核

已查范围未发现确定性阻断问题。原“导航完成但标签/日期控件尚未渲染”缺口在源码中闭合；本结论不代签真人采集或整体任务验收。

## 复核快照

- 工作树：`/Users/zyongzhu/.codex/worktrees/canvas-binding-fixes/Thirdspace-creator`。
- 基础 HEAD：`72ffed51ebb246f7efd8b883322fba867c090d02`，本轮修复为当前未提交增量。
- `ai-worker/src/runtime/platform/wechat-dom-witness.ts` SHA256：`054f0fed301fda238152020c1584a17b247669e3dec1a387fa1aaf800b1edc20`。
- `ai-worker/src/runtime/platform/wechat-dom-witness.test.ts` SHA256：`d3ebdd7b7835cb35f429e6900f598f1db91629cd056acbc3e7bdd8e2b6464cf6`。
- 仅读这两个文件、相关 source 既有边界及本轮日志；没有运行测试、访问浏览器、产品端口、用户数据、profile 或 Cookie，没有修改工作树。

## 源码结论

1. `wechat-dom-witness.ts:158–160` 从“count 为 0 就跳过标签点击”改为使用既有 observe 等待**唯一可见精确标签**，然后实际点击。全部视频、关注者增长及单篇视频共用该等待，尚未渲染不会直接进入错误窗口。
2. `:161–163` 保留 `.filter-row:has(.filter-extra)` 详情行与 1/2 日期值定位，同时使用 observe 等待 seven 和 thirty 都唯一可见；缺失或重复时不会猜第一项。原控件立即缺失的硬失败被替换为有限观察。
3. `:26–28` 的 observe 每轮和读取后检查原 signal，观察预算仍从 controls.timeoutMs 取得，间隔使用可取消的 delay；`wechat-browser-source.ts:160–182` 的原总期限和 finally 停止路径未改。新增等待没有刷新原 deadline、重启任务或续期。
4. `wechat-dom-witness.ts:147,164–188` 保留一次冻结的目标窗口、点击后新 request 身份、当前 frame、原生 response 完成和总数证明；日报/关注者仍要求 30 个实际日期和精确窗口，下载前仍复核状态。没有把“标签出现”当作报表已就绪，也没有放宽导出完整性。

## 实际已读回归证据

- `/tmp/t1110-render-ready-red.log`：13 DOM 测试，2 FAIL、11 PASS。两个延迟渲染 fixture 都在旧实现未点击标签就读取日期控件时失败；日志明确包含 `retry x2`，不称本轮 RED 为 retry 0。SHA256：`064b29ce252bc8b4f4d6c3631361703947afe8fb1e5c5f8c6dd8599450de36c4`。
- `/tmp/t1110-render-ready-complete.log`：**3 文件、44 PASS**，开始 22:50:15，耗时 7.37s。按当前文件数量为 13 DOM + 22 source + 9 parser；本代理读取的是这份完整日志，不使用此前误选 parser 路径的 35 例结果。SHA256：`eb9ed2d61499baa006593d7f2d62286ea30bc23dab4be69f65c5edfe1423cee2`。
- 新 fixture `wechat-dom-witness.test.ts:70–85` 分别覆盖日报和关注者：标签首次缺失，日期控件首次缺失，最终点击顺序 `tab→7→30`，并核实际 30 日期和窗口。夹具明确为合成协议，不连接账号。
- 既有 `:86–110` 覆盖旧 request 晚 response 不能签这次窗口及跨午夜冻结；`:111–135` 覆盖 source + 内置 witness 等待原生 response 时取消/原 240s inherited deadline、实际停止后 late response 不交第三份。它们仍在本轮 44 例套内。

## 真人证据边界

root 报告的原产品任务终态 `EXPORT_FAILED/0 页` 和固定诊断 `prepare/channelsDaily/REPORT_WINDOW_MISSING`，与此修复针对的“控件尚未渲染就立即拒绝”接缝相符。该一致性不能证明此次修复已使真人采集成功；本代理未读取或操作该任务，也未验证当前真实控件/下载结果。后续真人原生文件、公共提交及实际终态仍由新的明确 intent 验证，原失败保持历史。
