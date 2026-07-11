# SPEC 审核记录:immutable-account-anchor-design(T-201)

- **被审 SPEC**:`2026-07-10-immutable-account-anchor-design.md`
- **审核日期**:2026-07-10
- **裁决**:✅ **PASS**(可开工 T-201a~d)

## review_mode:双通道(cross-family + 主 agent 真机实测)

### ① cross-family(MiniMax `mmx text chat`)
- **verdict: PASS / findings: []**
- summary:针对两实测 bug(ctx 无号→数据全 null 封面紫;身份键挂可变 handle→重号)给出完整根因+修复,合宪法 §7 数据底座租户隔离,不造轮子,范围清晰,验收可执行。

### ② 主 agent 真机实测(代码接地,最硬证据)
不用子代理推测——主 agent 直接对运行中桌面 app dispatch(port 62773)实测:
- `accounts.list` → 当前号 `acct-397c3777-56`「月明水清深」。
- `assets.list` 带号 total **0**;不带号 **20 条全 account_id=NULL**;projects/publications 各 75 同 null。
- `getDownloadUrl` 带号 → `OwnershipError`;不带号 → 正常返 `/api/v1/blob/_default/...`(物理在)。
- 代码定位:`loginDouyin` onDouyinBound(ctx) 传 null ctx(`ingestion.service.ts:782`)→ claimOrphans no-op(`persistence-client.ts:4416`);UNIQUE `(user,platform,account_handle)` 挂可变 handle(`schema/platform-account.ts:63`)→ 漂移。
- 复用既有(不重造):`status`/archiveAccount 已存在→隐藏复用;`sec_uid` parseSelfIdentity 已抓(`ingestion.service.ts:387`)→ 稳定身份键;claimOrphan* 端口已存在→只喂对号。

## 裁决
- 两 bug 根因由真机实测锁死(非推测),方向合宪 §7,复用既有设施(status/sec_uid/claimOrphan 端口),不迁物理文件(避 T-196 事故)。**PASS,可开工 T-201a→b→c→d**。
- 诚实边界:多账号精确 targeting(T-136 §D)仍后续;单号现实安全。
