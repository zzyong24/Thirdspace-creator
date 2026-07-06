# SPEC — 存储目录改配置时内置文件迁移(T-162)

> 状态:待用户过目 · 2026-07-06 · 关联 T-157(账号分区存储)
> 一句话:用户在设置里改「媒体存储目录」时,把旧目录下的文件**自动迁移**到新目录,老 blob 不再 404。

## 1. 问题

- 存储配置 `storage_configs.root_path`(每用户一行),`backend='local'` 时文件落盘 `${rootPath}/${storageKey}`(+ `${storageKey}.meta.json` sidecar);`storageKey` 是**相对 root** 的(含 T-157 的 `<accountId>/<assetType>/<uuid>` 分区)。
- 改路径走 `client.putStorage({ body: { rootPath } })` → 只更新 `root_path` 一列。
- **缺口**:旧 `root_path` 下已有的文件**不搬**。改完后 blob 路由用**新** rootPath 解析,文件不在那 → **所有历史 blob 404**(封面、上传素材全裂)。

## 2. 目标

改 `local` 存储目录时,**内置迁移**:把 `resolveRootPath(old)` 下所有对象(整棵 `<accountId>/<assetType>/…` 树 + `.meta.json`)搬到 `resolveRootPath(new)`。因 `storageKey` 相对 root → **DB 里每个 asset 的 storageKey 不用改**,迁移只搬目录树。

## 3. 设计

### 3.1 触发点
`settings.storage.put` 的**后端 service**(不是前端):收到新 `rootPath` 时,与当前存量 `rootPath` 比较:
- 解析后**同路径** → no-op(仅可能改了 backend/其它字段)。
- `backend !== 'local'`(S3)→ **不迁移**(S3 迁移是另一码事:跨桶 copy,超本切片范围;明确标注 out-of-scope,put 照常只改配置)。
- `local` 且路径变了 → 跑迁移。

### 3.2 迁移机制(copy-verify-swap,事务性)
**不原地 rename 后才改配置**(rename 跨盘会失败、半迁移态危险)。用「先拷贝到新、校验、再切配置、最后删旧」:
1. `resolveRootPath(old)`、`resolveRootPath(new)`;确保 new 的父目录可建、有写权限。
2. **递归拷贝** old 树 → new(保持相对结构;含 `.meta.json`)。跨设备用 `fs.cp`(Node ≥16,recursive)——它内部处理跨盘;失败(权限/空间)→ **中止,不改配置**(旧目录原封不动,系统仍可用)。
3. **校验**:抽样(或逐个)比对文件数/字节数一致。
4. **切配置**:校验通过才 `updateStorageConfig(rootPath=new)`(这步之后 blob 路由指向 new,文件已在)。
5. **删旧**:配置切成功后,后台 best-effort 删 old 树(删失败只留孤儿旧文件,不影响功能;记日志)。

> 顺序保证任一步失败都不产生「配置指向空目录」的裂态:配置永远最后于「文件已就位」才切。

### 3.3 边界与决策
- **new 目录已存在且非空**:默认**合并**(`fs.cp` 覆盖同名;storageKey 是 uuid 基本不撞)。若想更保守可先探测非空→提示用户确认,本切片先取「合并」简单路径,注释标可加确认。
- **空旧目录 / 首次设置**(old 为默认或空)→ 无文件可搬,直接切配置。
- **`~` 展开**:两端都过 `resolveRootPath`(已处理 `~`/空/默认)。
- **磁盘空间**:copy-verify-swap 期间新旧并存,需 ~2× 空间;空间不足 → 拷贝阶段失败 → 中止不切,提示。
- **进度**:文件可能很多。v1 用**同步迁移 + 前端 pending 态**(putStorage 期间转圈 + 文案「正在迁移 N 个文件…」);若量大到卡,后续可挪到 job_run 带进度(复用 T-152 job 进度机制)——本切片先同步,标注可升级。
- **仅 local**;S3→S3 迁移 out-of-scope。

### 3.4 改动面
- `backend/src/modules/assets/`(或 settings 存储 service):加 `migrateStorageRoot(oldRoot, newRoot)`(纯 fs 迁移,注入 fs 端口便于测)。
- `settings.storage.put` service:检测路径变化 → 调 migrate → 通过才 updateStorageConfig。
- 前端 `putStorage` 调用处:pending 态 + 迁移中/失败反馈(复用现有 storage 保存 wiring 的 feedback)。
- 契约:put response 可加迁移结果(migrated 文件数 / skipped / 失败原因),前端显。additive。

## 4. 测试(TDD)
- 迁移:old 树(含 `<accountId>/<assetType>/x` + `.meta.json`)→ new,文件在新位、DB storageKey 不变、blob 从 new 可读。
- 同路径 → no-op(不搬不删)。
- 跨设备(fs.cp 回退)。
- 失败回滚:拷贝抛错(权限)→ 配置**未切**、旧文件在、系统仍可读旧 blob。
- 空旧目录 → 直接切配置。
- backend=s3 → 不迁移,put 照改配置。

## 5. 不做(YAGNI)
- S3↔S3 / local↔S3 跨后端迁移。
- 迁移中断的断点续传(失败即整体回滚重来)。
- 迁移进度落 job_run(v1 同步;量大再升级)。

## 6. 需不需要过 gate?
**加法能力,不改数据归属/方向**(storageKey 不变、只搬物理文件)——按铁律属 T-157 存储层延伸,**不需新 spec-review gate**。拆 1 个 Task(=本 T-162)直接实现。
