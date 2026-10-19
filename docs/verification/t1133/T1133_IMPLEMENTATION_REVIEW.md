# T1133 独立实施复核

- 审查时间：2026-10-09T14:34:34Z
- 基线 HEAD：`45a52992087c5e6aaa09cb1929fa8ec16d6b4c64`
- SPEC SHA256：`22565a09ed016972da9a5813d355e1e2b47858f5430a7799fccfae85a12a95c9`
- 最终测试源码：`production-workbench.test.tsx` = `7bc60346…`；`production.persistence-client.test.ts` = `6f5efb5b…`
- 结论：**PASS_LIMITED_IMPLEMENTATION；允许冻结提交当前两测试及真实证据，完整 canonical 结束前不得完成 T1133。**

## Workbench 恢复素材校准

原退役 `select` 观察已替换为当前真实 `AssetPicker` 按钮与 props 身份观察。`vi.spyOn(assetPickerModule, "AssetPicker")` 没有替换实现，默认 call-through，真实子组件仍渲染；`finally` 无条件 `mockRestore()`，不会污染其余 32 个 workbench 用例。

断言保留了两层事实：DOM 中按钮仍显示“恢复后的项目录屏”和“素材已不可用”；最后一次真实 picker props 同时保持 `choiceKey === "asset-saved"` 且 value 的 `assetId === "asset-saved"`。后续原断言未删除：同一 running execution card、confirmed notice、移除按钮、总提示、移除后 B-roll/inventory 为空，以及原确认请求落参仍全部执行。测试没有 mock 掉 `VideoDecisionPreview`、没有隐藏 test-only 属性，也没有把不可用素材换成新素材。

有限观察每次重新从当前 DOM 查按钮，等待项目素材清单 ready 后的真实状态；该例外层 180000ms 覆盖 120000ms 观察和后续上传、确认、清理余量，未改变产品执行期限。

## Persistence 目录、归属与幂等

原逐项无 ctx 调用仍遍历完整 `PRODUCTION_OP_IDS` 并要求拒绝。新增断言分别对 backend IDs 和独立 contract `productionOperations` IDs 查重，然后排序双向精确相等，消除了过期数量常量而没有弱化注册验证。

结果资产经正式 `assets.uploads.create` → `assets.uploads.complete` 在同一隔离 store 与 owner 下创建。原 get→put→segment→export→complete 链仍存在；complete 后继续断言 ready、精确 resultAssetId，并通过正式 `outputs.get` 回读同一个 `primaryAssetId`。

新增拒绝/恢复链证明：不存在资产拒绝且 primary 仍 null；同 user 异 account 创建的真实资产也拒绝且 primary 仍 null；随后同一 export 用同 owner 真实资产可完成；再次以另一个同 owner 资产重放仍返回并保留首次结果，不改绑。原素材包连续两次导出不增加普通素材的测试未改。

## 实际验证边界

- 原两文件 RED：33 PASS/3 FAIL，retry=0，exit 1，日志 `9e6c62cf…`。
- 第一次校准：36 PASS/1 FAIL，retry=0，exit 1，日志 `70770e90…`；失败保留为 T1134 时序诊断。
- 最终两文件：37 PASS，retry=0，exit 0，日志 `35cd3eec…`；此前同源码 ready run 也为 37 PASS。
- 相邻 `VideoDecisionPreview`/`AssetPicker`：18 PASS，日志 `49ba1ade…`。
- frontend type、boundary、semantic、orphan、diff 均 exit 0。

timeout-policy 实际 exit 1；27 条静态失败与 T1127 对照相同，不能称超时 Gate 全绿。完整 canonical 尚未终结。因此当前只准提交两测试及真实证据，不能 `taskctl complete`、签全局/安装/真实媒体编码/模型或视觉 PASS。

本次未发现未解决的实现 finding；初审 REV-001 与第一次校准失败均作为历史保留。
