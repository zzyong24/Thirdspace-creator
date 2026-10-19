# T1107 独立诊断勘误

勘误时间：2026-10-09（Asia/Shanghai）。本文件保留原 `INDEPENDENT_DIAGNOSIS.md` 原字节，但**撤回其中 T1107-DIAG-002“首轮200已跨账号换锚”的结论及对应产品修复建议**。原报告没有读取 repository 的 `factFilter` SQL，就把旧测试注释里的 user级事实假设当成当前合同，推论错误。

## 已纠正的真实合同

- 当前 `backend/src/modules/publishing/publishing.repository.ts` SHA256 `d81d5ec29ca293164ace45777a51d1c28269503e43ddd340f321f14f1cbfb54e`，`workspace-scope.ts` SHA256 `4dfabca2c21f96efb2cddde6f77b00cfe9f18a7e4b2f3ec92471f15fc361a712`。
- 当前与 `1889f349` 的 `findByExternalKey`、`getPublicationRowById`、`reAnchorPublicationOutput` 相关 SQL 逐字相同。
- `findByExternalKey` 实际条件为 `userId + factFilter(publications,deps) + platform + externalId`。legacy account scope要求当前 `accountId` 且 group为空或其规范legacy group；group scope若还带平台账号，则 `factFilter` 继续要求真实 `accountId`。
- `getPublicationRowById` 同样使用该 `accountGate`；`reAnchorPublicationOutput` 更新前后都先经过该门。
- T1062 SPEC明确“真实平台事实仍归真实账号”；DEC进一步确认发布锚为 `user+account+platform+externalId`，组总览不得在多账号结果中任取首行。产品定位也要求 publication 的 account 是真实平台属主。

因此B账号调用 `findByExternalKey(platform, iso-ext-a)` **不会命中A账号行**。现有日志没有返回publication ID或前后DTO，不能证明A行被读取或换锚。首轮200更符合当前合同的解释是：B账号在自己的事实域中创建了同 externalId 的另一行；这是跨账号同平台ID可并存，不是自动收编A。

## 两处失败的当前分类

### 1. 平台操作数

原 T1107-DIAG-001 保持：`accounts.bindingCapabilities` 在1889基线已经是第六个正式持久化操作，测试仍硬编码5，属于旧断言漂移。应校准为精确六ID并保留每项无ctx拒绝。

### 2. C-09

原测试注释和断言仍把 `(platform,externalId)` 当user级唯一锚，与T1062之后的 `user+account+platform+externalId` 合同冲突。首轮200本身不能判为安全缺陷。随后retry在第340行409，说明第一次尝试留下了本账号B的同externalId事实，且文件级`beforeAll`没有为retry重置；它也不能反向证明A被修改。

当前分类应改为：**旧C-09断言与当前账号事实合同漂移，且retry复用共享数据库造成二次夹具污染**。在 root 的隔离诊断提供A/B前后DTO和响应ID之前，不再对具体创建行或锚变化作动态PASS声明。

## 最小可评审校准方向

不改产品。只在既有公共测试中按当前合同保留并加强隔离：

1. A、B可用同一 `(platform,externalId)` 各自登记，返回两个不同publication ID；B的行必须绑定B output/account，A的原行和revision逐字段不变。
2. A读取B ID、B读取A ID及各自父锚交叉读取仍必须404；列表只出现本账号行。
3. 同一个账号内，同 `(platform,externalId)` 的same-output保持幂等；不同真实项目仍应409，不能把同账号canonical锚放宽。
4. 该文件诊断/校准固定`retry=0`，或每次retry创建全新外部ID并独立reset；不得用首轮写入污染后的409充当安全证据。
5. 等 root 隔离dispatch产出响应ID和A/B前后DTO后，把上述静态判断与真实数据对齐；若A DTO实际变化，才需重新追查ctx构建或factFilter入参，而不能沿用本报告静态推断。

## 当前边界

本勘误不宣称C-09已经通过，也不签任何测试或产品修复；它只纠正根因分类和撤回无证据的跨账号换锚指控。T1107正式SPEC应等待隔离动态证据，再决定是否仅校准两个旧测试。原日志、原错误报告和全部失败保持可追溯。
