# T1178 独立 SPEC 初审

结论：**PASS，限定当前 SPEC 初审**。无阻断或建议 findings。第一例漏掉已存在的第三方声明资源，属于静态合同断言漂移；没有据此认定产品打包、启动或安装失败。

- 当前 HEAD：`335b1b5e055b1c8cb0935fe7f512409532236592`。
- 当前 SPEC SHA-256：`db792b5640469348504aa6f1ffa795d2f1259cc25dd07a9f8d9a40f122a34411`。
- 产品宪法 `docs/产品定位.md` SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。
- 独立评审人：`/root/t1159_fix_recheck_recovery`。全部实读路径、字节 SHA、Git 对象及适用读段见 READ_SET.json。

实际原 RED 的收据为 exit1，外层 2.0262746249791235 秒；日志最终为三文件、42 PASS / 1 FAIL。失败是第一例在 shared 资源断言处拒绝真实 `THIRD_PARTY_NOTICES.md`；原 retries x2 与完整失败字节保留。实算日志 SHA 为 `cb48cdced5769f5cf02b956ccc86b6017d471227909747957835d1424606bdfb`，与收据的 logSha256 一致。收据自身 SHA 单独列于读集，没有混称日志 SHA。其它两文件通过只说明本次静态检查结果，不替代真实首启。

已实际读取两份当前配置全文与提交 `65781a811da57b50a3446fb74e081143bff317e6` 的原 diff/Git blobs：当时两配置都在原 tar 后增加声明文件，当前完整配置字节与这些历史 Git 对象相等。声明资源当前存在，内容为既有 infinite-canvas 第三方声明；本轮不作额外许可审计或增加资源政策。

当前已确认范围仍在 maintenance 的 4-build。技能版本与项目版本均 3.29.0。本轮仅独立初审，不派发实现，不编译或伪称 Task Packet。产品宪法要求干净 macOS/Windows 的安装、首启、升级、断网、重启与数据保护真实证据；本静态校准没有更改该发布验收。

精确代码写集只有 `frontend/scripts/desktop/windows-runtime-config.test.mjs`：改第一例表述，对 shared 和 Windows **分别精确期待** `["sidecar.tar.gz", "THIRD_PARTY_NOTICES.md"]`，并对两配置分别保留 `not.toContain("sidecar/")`。现原测试仅 Windows 有显式目录排除；SPEC 补上 shared 排除不会减弱原保护。精确数组同时拒绝额外资源、展开目录和 tar 缺失，不可替换成宽松 contains。

```mermaid
flowchart LR
 A[原 RED：遗漏既有声明] --> B[两个配置精确期待 tar + 声明]
 B --> C[保单 tar、无展开目录及原五例]
```

原其它五例必须全留：NSIS currentUser/hooks 与安装期物化、所有平台 tar 入口、Rust 真实 SHA、安装期指针优先和旧 tar 兼容兜底、损坏 runtime 的原错误透传。原测试全文已读，没有通过减少用例或改 runtime 迎合旧断言的必要。本轮只读 Git 比较确认原测试、两配置、声明资源及相关构建/runtime 文件相对 HEAD 无未提交 diff；其它任务变更不在本次评审范围。

验收安排足够覆盖这一校准：原 RED 保留，后续精确文件及原 LED006 完整命令真实重跑，保原重试/预算；取得当前 boundary/semantic/orphan/diff 及独立实施复核。本次没有执行上述命令，没有当前实施/GREEN 结论。若其它门失败，保留原任务归属与真实失败，不能凭本初审消除 T1015 或完整 canonical 的欠债。

本结论不签真实 Windows 安装、GUI/WebView 或原生 App 启动，不签新包、完整 Gate、任务完成、真用户安装、平台/模型执行或微信研究恢复。仅写本私有报告目录，未修改仓库、代码、消费者、任务状态、验证器、配置或旧证据。
