# T1133 独立 SPEC 初审

- 审查时间：2026-10-09T14:06:47Z
- 当前 HEAD：`45a52992087c5e6aaa09cb1929fa8ec16d6b4c64`
- SPEC SHA256：`22565a09ed016972da9a5813d355e1e2b47858f5430a7799fccfae85a12a95c9`
- Constitution SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- Modules SHA256：`6d4ca5a4a00b3fcdaeb269a7c422286213c0ebca7711ff2a587acbeba5fcb074`
- 结论：**CHANGES_REQUIRED**。

## 已确认正确的范围

两条测试校准均对应原序日志的确定失败，没有要求修改产品或降低业务断言：

1. LED-032 的唯一失败是退役 DOM `select` 返回 null 后读取 `options`。SPEC 要求改用当前 `AssetPicker` 的可访问按钮、已选卡和原确认调用，同时继续证明恢复名称、不可用状态、`asset-saved` 身份、移除后 B-roll/inventory 清空、同一个 running task 与原确认落参。这保留了原业务保护，未通过 mock 子组件或隐藏测试属性洗绿。
2. LED-040 的两个独立失败分别是 `PRODUCTION_OP_IDS` 已有 32 项而夹具写死 18，以及 `exports.complete` 传入不存在的资产被正式 owner 门拒绝。SPEC 要求从独立 contract `productionOperations` 与 backend `PRODUCTION_OP_IDS` 做双向集合和重复项核对；再经正式 upload create/complete 创建同 owner 资产，用真实 ID 完成导出并从 `outputs.get` 回读 `primaryAssetId`。不存在、异 owner、拒绝后合法完成、同请求重放不重复绑定也被保留或新增。

这套方案不会把 owner 拒绝改成成功，不会删除无 ctx 的注册操作验证，不会把目录数量再次硬编码，也不读取用户媒体。测试所需中性资产通过当前隔离 PGlite 与 mock 对象存储建立，符合测试边界。

原日志边界也写得诚实：LED-032 为 44 PASS/1 FAIL，LED-040 为 33 PASS/3 FAIL，均来自旧配置的 retry x2，不冒充 retry=0 RED。来源日志 SHA 分别为 `152b4464…` 与 `c025a403…`，尚无修复 PASS。

## REV-001：缺正式模块绑定

当前 `orchestrator/process/modules.config.json` 中没有 T-1133。SPEC 虽然列出了两个测试写集、相邻组件回归、retry=0、120 秒预算、类型和静态门，但在 `taskctl start` 前没有机器可执行的路径与命令约束。这样实施可能遗漏相邻 `video-decision-preview`/`asset-picker`、独立 contract 集合对照或完整 reconcile，且 context compile 无法发现越界写入。

必须补入 T-1133 精确模块：产品写集为空；业务测试写集只有 SPEC 两文件；控制/证据路径单列。验证命令至少覆盖原两文件同命令 retry=0/no-file-parallelism/test+hook 120000、两个相邻组件测试、contract production 操作测试、frontend typecheck、diff/boundary/semantic/orphan 与 reconcile。随后对同一 REV-001 做 recheck，才能开始实施。

除 REV-001 外未发现阻断。此结论未运行测试、构建、数据库、模型或 App，不是实现、GREEN、安装或全局验收 PASS。
