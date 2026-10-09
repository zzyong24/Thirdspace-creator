# T1145 SPEC 独立复核

- SPEC SHA-256：`3e15977a72b36c08ef912f6567c9f4cca898244edaa832b6fe9e65d2c46afb67`（字节未变）
- 当前 modules SHA-256：`a7f4c44fb41309cf997c346979682848174e049f3fd4bb687e134ee49b758a8b`
- 产品宪法 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 结论：`PASS`

## REV-001 销账

正式 `T-1145` 模块现已把证据写集改为 `docs/verification/t1145/**`，与 SPEC 和现有证据目录一致。

`verify_commands.implementation` 现精确绑定：原 T1140 实际 Chrome runner；AssetPicker、source 与 media preview 三个相关组件测试；LED-047 原八文件；frontend typecheck；boundary、semantic、orphan；timeout policy；diff、pmem 与完整 reconcile。

浏览器仍由现有 runner 保持原视口、原 0 retry 与预算。模块没有把 T1141 后端或其它独立任务混入 T1145 写集。T1144 的诊断证据目录也已机械纠正，但不构成 T1145 的产品范围或验收代签。

因此原 REV-001 的两个失败模式均已消除：真实 T1145 证据可以在允许写集落盘，且布局覆盖、page/gallery 倒退、选择/保存回读、LED-047、类型和静态回归不能只靠 `git diff --check` 绕过。

## 最终范围判断

产品仍仅允许修改 `frontend/src/components/media/asset-picker.tsx` 的 gallery 根与预览 aside 物理收缩行为。原图确认的覆盖问题、page 消费者复核、T1140 field 字节边界和既有选择/归属语义均保持初审判断。

本 PASS 只允许 reviewctl 正式记录后进入实施；不表示产品已改、浏览器已 GREEN、worker 清理失败已解决、完整 Gate 或安装已通过。原初审 CONCERNS 已保存于 `docs/verification/t1145/initial-SPEC_REVIEW*`，不得覆盖或改写。
