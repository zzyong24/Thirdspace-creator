# SPEC:不可变 account id 锚点 + 身份与昵称解耦(T-201)

> 日期 2026-07-10 · 状态:待过 spec-review gate(改数据归属)· 对照宪法 [docs/产品定位.md](../../产品定位.md)
> 单一执行总账在 [BACKLOG.md](../../../BACKLOG.md)。用户 2026-07-10 拍板设计,本 SPEC 是其形式化。

## 0. 一句话

**每个绑定的抖音账户有一个系统生成、永不可变的 `account id`,它是文件系统与数据库租户隔离的唯一锚点。** 抖音昵称降级为可编辑的显示名(display name),缺省用采集到的昵称,但**绝不参与身份解析或存储路径**。绑定后的账户只可隐藏、不可移除;隐藏则其定时采集任务停跑、存量数据按 id 锚点原地保留。

## 1. 问题:两个实测 bug(封面全紫的完整链)

真机实测(桌面 app dispatch,账号 `acct-397c3777-56`「月明水清深」):
- `getDownloadUrl` **带号** → `OwnershipError: Asset not found`;**不带号** → 正常返 `/api/v1/blob/_default/...` URL(物理文件在)。
- assets 带号严格 eq → **total 0**;不带号 → **20 条全 `account_id=NULL`**。projects 75 / publications 75 同为 null 号。

### Bug-1:绑定时 ctx 无号 → 认领/写号全落 null(no-op)
`loginDouyin(ctx)`(`ingestion.service.ts:749`)绑**新号**时 `ctx.accountId=null`(号是本次 `ensureAccount` 刚建)。但 `onDouyinBound(ctx)`(:782)传的是**原 null ctx** → `bootstrapDouyinCollectionJobs` 的 `claimOrphans(c)`(`persistence-client.ts:4416`)对各表跑 `UPDATE ... WHERE account_id IS NULL SET account_id=NULL` = **no-op**;建的 job 落 null;初始化采集 ctx 也 null → 采集数据全落 null 号。→ webview 带真号严格 eq(`assets.repository.ts` accountGate)0 命中 → 封面 OwnershipError → 紫色。

### Bug-2:身份键挂可变 handle → 锚点漂移 / 重号
`platform_accounts` UNIQUE `(user_id, platform, account_handle)`(`schema/platform-account.ts:63`)。绑定时 `ensureAccount(handle="我的抖音")` 建号;之后 `updateAccountHandle` 把 handle 改成真实昵称。下次 `loginDouyin`(「已有账户」也复用它)再 `ensureAccount("我的抖音")` → `(user,douyin,"我的抖音")` 已不存在 → **建第二个号**。身份跟着可变昵称漂移。

## 2. 设计(用户拍板 + 复用既有设施)

### 2.1 account id = 唯一不可变锚点
- `platform_accounts.id`(现 `acct-...`)**已不可变**,确立为 fs(`media/<accountId>`,`object-storage.ts:22`)+ DB(各表 `account_id`)租户隔离的**唯一锚**。绑定成功即生成、终身不变。
- **绝不允许**任何路径用昵称/handle 当身份或存储路径。`_default` 仅用于「真未绑号」的降级,绑定后的数据一律锚真 id。

### 2.2 身份解析与昵称解耦(治 Bug-2)
- 新增 `platform_accounts.external_account_id`(抖音 `sec_uid`,采集 `parseSelfIdentity` 已抓,`ingestion.service.ts:387`;人可读抖音号存 `sourceIdentifier`,sec_uid 是稳定锚)。
- **身份解析键从可变 `account_handle` 换到稳定 `external_account_id`**:UNIQUE 改 `(user_id, platform, external_account_id)`(sec_uid 未知时的首绑:见 §2.3)。`account_handle` 降级为**可编辑显示名 `display_name`**,可空、可改、非唯一,缺省用采集昵称。
- 迁移:存量号 `external_account_id` 从其 external_source `sourceIdentifier`/sec_uid 回填;回填不到的保留旧 handle 键兜底(单号现实不冲突)。

### 2.3 绑定流程改造(治 Bug-1 + 立即修封面)
- `loginDouyin`:`ensureAccount` 返回 `{id}` 后派生 `boundCtx = { ...ctx, accountId: ctx.accountId ?? ensured.id }`,**用 boundCtx 调 `onDouyinBound` 与 `ensureDouyinSource`** → claimOrphans/建 job/初始化采集全落真 id。
- 首绑 sec_uid 未知:先按「本 user 本 platform 是否已有 active 号」复用(单号现实),避免重号;采集拿到 sec_uid 后回填 `external_account_id`(幂等)。
- **存量 null 数据一次性认领**:boundCtx 下 claimOrphans 真生效(现有 `claimOrphanImportedProjects/Publications/Metrics/Assets/Jobs` 端口不改,只喂对号)→ 20 assets/75 projects/75 pubs/metrics 归 `acct-397c3777-56`。**storageKey/物理文件不迁**(读用存的 key,`_default/...` 物理在、能读到;账号隔离靠 DB `account_id` + accountGate,已足够,避免 T-196 式搬文件事故)。

### 2.4 只隐藏不移除(复用既有 status)
- `platform_accounts.status` 已有 `active`/`archived`(`archiveAccount` 已存在,`persistence-client.ts:542`)。移除账户的入口一律改为**隐藏 = status→`hidden`**(或复用 `archived` 语义,实现时定一个,不新建平行枚举)。**不提供硬删除**(合"无硬删除"安全原则)。
- 隐藏可逆(可恢复 active)。数据按 id 锚点原地保留、可读。

### 2.5 隐藏则定时任务停(新增 gate)
- `triggerScheduledJob`(cron 到点 / 立即运行两触发路)执行前查该 job 归属号 `status`:非 active(hidden/archived)→ **跳过不跑**(诚实 log,不报错、不删 job)。恢复 active 后照常跑。
- 判据落在 trigger 入口(单点),cron 与手动触发同源生效。

## 3. 切片(拆 Task)

- **T-201a 封面根因修(立即,治 Bug-1 + 认领存量)**:`loginDouyin` boundCtx 派生 + onDouyinBound/ensureDouyinSource 用 boundCtx;首绑复用既有 active 号防重号。单测:绑定后 claimOrphans 落真号、采集 ctx 带号。→ 重 build 真机验 `getDownloadUrl` 带号 200。
- **T-201b 身份解耦(治 Bug-2)**:加 `external_account_id`(sec_uid)列 + UNIQUE 迁移 `(user,platform,external_account_id)`;`account_handle`→可编辑 `display_name`(可空可改非唯一);存量回填;`ensureAccount`/`updateAccountHandle` 改为「昵称只更 display_name,永不改身份键」。
- **T-201c 只隐藏不移除**:移除入口→ status hidden(复用 archived 或新 hidden,择一);去掉硬删除路径;设置页/切换器文案「隐藏」。
- **T-201d 隐藏停定时**:`triggerScheduledJob` 入口查号 status 非 active 即跳过 + log;恢复即恢复。

## 4. 不做(YAGNI / 诚实边界)
- **不迁移物理文件/storageKey**(`_default/...` 读得到,DB 锚点足够;搬文件是 T-196 事故源)。
- 多账号精确 targeting(每 cron 按号)仍是 T-136 §D 后续,本 SPEC 单号现实安全。
- 不做账户彻底删除 + 数据级联清理(只隐藏)。

## 5. 验收
- 真机:`getDownloadUrl` 带号 → 200 + 封面真显示;素材中心/复盘封面不再紫。
- 昵称改变(采集回填)后再绑/刷新**不产生第二个号**(external_account_id 稳定)。
- 隐藏号后其三条定时 job 不再触发(log 可见跳过);恢复后恢复。
- 三端 typecheck + 相关单测绿;迁移幂等、只动本 user。
