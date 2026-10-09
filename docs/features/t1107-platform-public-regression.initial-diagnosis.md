# T1107 平台公共回归独立诊断

诊断时间：2026-10-09（Asia/Shanghai）。基线：main `d35f7d57ff952d306071eb40d34127956b067906`。结论：**CHANGES_REQUIRED**。两处失败性质不同：账号操作数是确定的旧断言漂移；C-09 首轮200是确定的跨账号外部作品换锚缺口，不能通过更新断言放行。

## 证据绑定

- T1107 登记 SHA256：`563bcc6c3f6f08be072a63cca9f974679256f023f965fd5098ae1d1c1b5d8b72`。
- 实际结果 JSON SHA256：`ad6d6d0635e64cb12ed789e7d1ef663dc60198726d0ea85f2bc906c2774ebf25`；日志 SHA256：`d2caac4f1aa5bdbe73a55e767390f141fc28467d124142fc1c1ebe2982778f13`。实际3文件24例为22 PASS、2 FAIL。
- 两个失败测试当前 SHA 与 `1889f349` 基线逐字相同：platform account 测试 `2d39ed3237282f2e550e1f35a0041f055510bed8c13d00ed47dbe394afff5749`，account isolation 测试 `4a635c98902ef89d77f1c4e820e0641adff700121eb6b984870765de3eb0b56b`。
- platform transport 当前/1889 基线 SHA均为 `b1ea69d27bd2f40a567a28b4302d4b17095220dc4b099d8a24fc25df8ebc2fc3`；publishing service 当前/1889 基线 SHA均为 `5c741ec2fa1924ca2035a9c953a79cc5f3a5f75e91754bd4ee25f8fba15b07e9`。因此两项都不是 T1101 合并新引入；一个是旧测试陈旧，一个是旧产品缺陷首次被当前公共回归暴露。

## 诊断一：账号操作数 5→6

`PLATFORM_ACCOUNT_OP_IDS` 在当前和1889基线中都精确包含：

1. `accounts.list`
2. `accounts.bindingCapabilities`
3. `accounts.create`
4. `accounts.get`
5. `accounts.update`
6. `accounts.archive`

测试已经遍历实际数组，并证明六项在无身份时都进入持久化认证门；唯一失败是末尾硬编码 `toHaveLength(5)` 及标题/注释仍写“五个”。第六项 `accounts.bindingCapabilities` 有真实 transport 分支和正式 service 返回，不是 mock、越权入口或 T1101 临时操作。

结论：这是旧断言漂移。最小修复只改该既有测试，把标题、注释和数量校准为六；更稳妥的是断言精确六个 ID 及每个无 ctx 均拒绝，避免未来“只改数字”掩盖意外注册。产品无需为此删除合法操作。

## 诊断二：C-09 首轮200、随后409

原 public 测试用账号A创建 publication `iso-ext-a`，再由账号B用自己的 output 登记同一 `(platform, externalId)`。它要求拒绝且不得返回/改写A的行，这是有效的账号隔离断言。

当前 `registerOwnerPublication` 的实际链：

1. user-scoped `findByExternalKey` 能找到A的 publication；该查询刻意不按 account 过滤，用来发现全用户唯一外部事实。
2. service 用当前B ctx 调 `resolveOutputOwner(existing.contentOutputId)`；Projects 的真实 owner 门令A的 output对B不可见，因此返回 `null`。
3. `registerOwnerPublicationInRepo` 把这个“对当前账号不可见”误当成“孤儿 owner 不存在”，命中 `!ownerOld` orphan repair，调用 `reAnchorPublicationOutput`，所以首轮真实返回200并改变了 canonical 锚。
4. Vitest retry 没有重新执行文件级 `beforeAll` reset。首轮已经把 `iso-ext-a` 换到B项目；重试再次创建fixture时，第340行的正常注册撞到首轮残留，才返回 `external_work_owned_by_another_project` 409。这个409不是原C-09门成功，而是第一次越权换锚后的污染。

安全含义：`null` 同时表示“真实孤儿”和“当前ctx看不见”，违反了“跨账号不可把别人的平台事实收编到自己项目”的边界。删除C-09断言、把200解释为合法归一，或只将retry改为0而不修产品，都不成立。

## 最小可评审修复建议

产品应在 orphan/imported 重锚判断前验证 existing publication 的冻结工作区归属。对平台 publication，`accountId` 是平台事实账号，必须与目标真实 account 精确一致；group 仍按既有工作区规则核对，不能因为同user或同group就允许另一平台账号抢同一 external key。只有同一合法账号范围内，才继续原有：

- same-output 幂等；
- 同项目另output收口；
- 真实 imported→manual；
- 真实 orphan repair；
- 不同真实项目409。

建议精确写集：

- `backend/src/modules/publishing/publishing.service.ts`：在重锚前区分“不可见/跨账号”与“真实孤儿”，沿既有 Ownership/Conflict 类型拒绝；不改唯一键、不开放跨账号读取。
- `backend/src/modules/publishing/publishing.service.test.ts`：补同user双账号、existing owner对当前ctx不可见时零重锚；保同账号 orphan/imported repair、same-output、same-project 和不同项目409。
- `frontend/src/server/__module_integration__/account-isolation.acceptance.test.ts`：保留C-09拒绝目标，增加失败后A publication/output锚逐字未变、B无新增/无收编，并以 `retry=0` 的新鲜隔离运行证明首轮行为。错误文案可校准为正式 typed error，但不得把拒绝改成200。
- `frontend/src/server/__module_integration__/platform-account.persistence-client.test.ts`：精确六ID与持久化认证门；不改产品。

若实现选择通过原publication冻结account构造可信 owner ctx再读，也必须先验证调用者当前workspace与publication一致，不能借内部ctx读取把A的owner信息泄给B。不要新增第二套归属判断或按业务名称特判。

## 必验公共链

1. 上述两个 frontend integration 文件，固定 `--retry=0 --no-file-parallelism`；首次C-09即拒绝，且DB锚未变。
2. publishing service 原完整测试，特别 T-724 orphan/imported/same-project/different-project/归档矩阵。
3. publishing contract/transport 与 projects owner seam，证明正式 dispatch 返回安全 typed error，不泄露A项目详情。
4. platform account transport/contract，六个ID全部正式注册且无ctx拒绝。
5. backend/frontend typecheck、boundary、semantic、orphan；随后按T1107正式SPEC执行相关全链。当前报告不代签修复或Gate。
