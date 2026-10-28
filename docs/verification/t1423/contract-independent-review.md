# T-1423 一键升级契约独立联审

2026-10-23。审查人：独立契约审查 agent `ci_contract`。仅静态阅读文档及必要既有源码，没有修改产品、执行测试、调用接口、连接数据库或进行激活/释放/发款/打包。

## 结论

**可向用户申请下述准确 Activity 本地隔离修改范围；完整 wire 尚未批准，产品实现及跨端验收均未 PASS。**

专用新路径、只读 inspect、受限 restore、同项目与排序码锁内重验、精确失效集合 fence、已绑定纯 no-op，以及按当前权威状态收敛 unknown，构成必要且有限的候选。无需为本任务默认新增 operation 表、经济账本、数据库 schema 或修改普通 activate。Activity 的新范围必须另按其 AGENTS 获得明确授权，既有 T250 授权不能代替；本审查本身不授予权限。

## 实际输入

Creator 基线 HEAD：`9c585dd4db5f263d228bb71bb832700dfd81f64e`。以下为本次实际读取字节 SHA-256；未把客户端候选稿当已发布网络合同。

| 输入 | SHA-256 |
|---|---|
| `docs/verification/t1423/client-contract-audit.md` | `7786ea8cb565473572f3b0d90831486113257ad777f51d729cec0a6b1be4b8d7` |
| `docs/verification/t1423/activity-contract-audit.md` | `736aedf58fa4e272448c1e281951e78c6f51d0b769f4e26e909ed26fa7f15dab` |
| `docs/features/t1423-legacy-license-one-click-upgrade.md` | `4a3b8dcb176ee7b587aea87185a05ca90b30eac7784595c2308bc4e9dc95f568` |
| `orchestrator/context/T-1423.md` | `785b64fc9567be33c445c7ff2b605b07b8282b9a4128634ccc3d23dc22dab882` |
| `/Users/zyongzhu/terminals/growth-credit-20261023/ACTIVITY_LEGACY_UPGRADE_SCOPE.md` | `9fd80fed2f8a74261f9bea7b3fb4325994b9b12d46b28f5e3a70cc8740e914c1` |

## 已闭合的方案边界

- 一次明确点击串行完成 fresh proof、必要原生恢复、原 Growth 履约、配置与 store 新观察；已有绑定跳过恢复。Rust 读取固定保存码，不让 JS 输入/获得原码、设备、释放列表或 URL。钱包和已履约首赠复用，未领者沿原资格唯一履约，不消费模型、不改个人偏好。
- 普通 activate 具有切换授权的不同语义，不能套按钮或增加会被旧服务器忽略的安全字段。候选 `POST /api/license/restore-current` 遇旧服/错误版本安全停止，不回退 activate；Status 不兼有恢复写。
- inspect 不调用会补行/更新 lastSeen 的 helper。restore 在同项目与受影响码排序锁内重新读取目标、项目、grant、当前/上一代机器摘要、设备行和墓碑。另一有效授权意味着整事务零写；只释放服务器确定且属于精确摘要集合的同机同项目失效占位，后续任何失败必须回滚释放、绑定和审计。
- 已合法绑定当前机器时返回现状、零写，不因为重试释放后来出现的其他绑定。缺绑定时，其他有效绑定、目标其他机器、禁止墓碑、未知 kid、未激活/过期/撤销/耗尽与不明历史均不能借恢复绕过。TIME 原实际期限、永久 null、COUNT 次数、原开始时间、渠道、maxDevices 和换绑额度不变。
- 本机“其他有效0、失效1”的授权是操作时必须 fresh 核对的特定条件，不是通用批量释放权限。通用资格仍由服务器裁决；本地保存码不是服务器可验证的硬件所有权证明，不假造 owner/OTP。
- 原生新恢复不触发旧 activate 的异步 Activation 同步；许可、经济与配置保留各自部分成功。checked 原子写入及回读区分旧值、新候选已落地、unknown；模型 proof 不能替代本地保存确认。取消只撤销观察资格，不撤销已发 IPC 或释放提交锁。
- 新恢复无条件强验签已补入当前 SPEC 和范围说明：旧 `frontend/src-tauri/src/license.rs:1713,1849–1853` 的 `cfg.strict_verify=false` 会跳过签名和 nonce，新命令不得继承此分支。原许可链既有行为不借本任务扩改。
- unknown 跨稿歧义已由当前 SPEC 的六行情形表及范围说明消除：已发恢复未知后只读核对；已绑定可 checked 保存；仍缺失或集合改变停止旧观察。用户明确再次继续才建立新的 inspect/fence，不在旧观察内静默扩大释放。两份原审计稿保留原 SHA，最终 wire 须消费这份更新后的统一规则。

## 完整 wire / 产品开工前仍须闭合

以下是现有候选本身的落地条件，不增加产品领域或持久化机制。

1. **冻结准确 wire。** 为 inspect/restore 固定 exact 请求/响应字段、版本、类型/长度、nonce、签名 request-target、状态及 typed 错误；签名能力缺失写前拒绝。新原生命令不论旧配置为何都要求有效公钥和完整签名/digest/target/host/date/nonce 校验，拒绝弱配置测试须存在。不能把当前两份审计稿的候选枚举当最终 wire 已批准。
2. **冻结精确摘要及事务判定。** 明确 canonical 输入、用途、项目、目标不可变生命周期/原开始事实与 epoch、当前机器摘要、设备版本、关联授权状态、精确失效集合和版本/期限；不能只有数量或裸码 ID。摘要不是授权，服务端必须重算当前资格与冲突。已绑定 no-op 不借旧摘要执行额外清理。PG 用例必须覆盖原集合变化、锁等待后撤权/跨期及混合有效+失效时全部零写；不能只在锁前查一次或在已释放后返回失败 result。
3. **将已消歧的 unknown 表落实到 wire。** Activity 原稿第77行与客户端 §4/§6 的旧表述以当前 SPEC 六行表为准：已发恢复未知后只读核对；当前已绑定可 checked 保存/继续；仍缺失、集合改变或冲突停止旧观察，用户明确再次继续才按新事实和 fence 决定。完整 wire 和消费者须逐项遵循该表。无需新 operation 表，不承诺无法证明的原请求永久执行回执。
4. **冻结总截止和身份 fence。** 新命令、网络技术重试、mirror、履约与配置观察共享一次绝对总截止，加入共享 flight 不续期；确切值依 LED-053 在合同及测试中确定。锁内保存码/当前宿主与保存前同对象核对；group/account/generation 变更或关闭后的迟到结果不能覆盖新状态。原生互斥不得重入已持锁的 `run_chain_and_persist`。

## 可申请的准确 Activity 本地范围

新增且仅新增以下三源码、三测试；既有 helper 为只读复用。若真实实现必须改 helper，先提出准确新增路径，不能用“必要 helper”隐式扩写集。

| 路径 | 职责 |
|---|---|
| `src/app/api/license/restore-current/route.ts` | 闭合专用路径、签名出口、无旧 activate 回退 |
| `src/lib/license-restore-current-contract.ts` | wire、摘要、typed 错误 |
| `src/lib/license-restore-current-service.ts` | 只读 inspect、锁内原子受限恢复 |
| `tests/license-restore-current-contract.test.ts` | 请求/签名/旧服/失败零写 |
| `tests/license-restore-current-service.test.ts` | 原权益保持、冲突、no-op、unknown、当前时钟 |
| `tests/t1423-license-restore-current-local-pg.test.ts` | 自有隔离 PG 的真实锁、唯一约束、回滚与竞态 |

必要工件仅范围说明列出的 `PRODUCT_SPEC.md`、`BACKLOG.md`、新增 `docs/contracts/T-1423-license-restore-current-contract.md`、`orchestrator/ARTIFACT_MANIFEST.yaml`、`orchestrator/DECISION_LOG.md`、`orchestrator/TRACEABILITY_MATRIX.md`；taskctl 仅追加本任务真实 `orchestrator/events.ndjson` 事件。不得覆盖已占用任务编号。

不改 schema/迁移、普通 activate/status/consume、管理页面、部署配置、Growth 钱包或经济规则。仅新隔离候选及自有测试库；不改生产参考/T250冻结候选，不连接生产或原验收数据库，不提交/推送/部署/重启/实赠/真实激活释放。产品实现许可与未来部署许可分开；本地回滚保留 diff 即可，真实恢复不能通过抹历史或任意解绑伪撤销。

## 证据边界

本审查支持申请准确本地范围，不代表用户已批准，也不代表 wire/产品代码、PG 并发、强验签向量、checked 落盘、经济身份稳定、安装版按钮或线上服务已验收。完整 wire 闭合后再独评，实施后需真实 RED→GREEN、固定源码、跨端发行向量与对应 Gate。打包/原生入口限制见同目录 `package-validation-audit.md`，受控组件不能冒充真实桌面操作。
