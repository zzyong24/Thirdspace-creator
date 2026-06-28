# 存储本地磁盘绑定(local-fs 后端 + 可配置路径)实现计划

> item B of「设置化」批次。媒体存储以本地磁盘为主、S3/MinIO 可选;路径可在设置改;
> StorageUsageCard 做真。承接 item A 同款 orchestrator 垂直切片。

## 决策(已与用户确认 2026-06-28)

- **存储后端 = 本地盘为主 + S3 可选**。默认 local-fs;设置里可改路径,可选切到 S3/MinIO。MinIO 仍可用但不再必须。
- **默认媒体根路径 = `~/CreatorOS/media`**(用户可在设置改成任意路径,如外置盘)。

## 现状(已勘查)

- `ObjectStoragePort`(`frontend/src/server/modules/assets/object-storage.ts`):`createPresignedUpload({assetType,mimeType,fileSize})→{storageKey,uploadUrl}` / `headObject(key)→HeadObjectResult` / `getSignedUrl(key)→string`。
- 适配器:`createS3ObjectStorage`(s3-object-storage.ts)、`createMockObjectStorage`(object-storage.ts,返回 `mock://` URL,FE 跳过 PUT)。
- 选择接线:`persistence-client.ts:863-894` —— `S3_BUCKET` env 有则 S3,否则 mock;`nextKey=()=>`uploads/${nextId(objkey)}``;objectStorage 注入 `AssetsService`(唯一消费方)。
- FE 上传:`asset-upload-button.tsx` —— createUpload → 若 `uploadUrl` 是 http(s) 则 `PUT` 真字节 → completeUpload。**所以本地后端只要把 uploadUrl 做成一个本地 http 路由,FE 不用改。**
- StorageUsageCard:吃 `buildStorage()` 假数字(18/64GB)。

## 关键安全要点(本切片必须做对)

- **路径穿越**:storageKey 用户不可控但要硬校验(拒 `..`、绝对路径、空段);blob 路由解析出的真实路径必须 `path.resolve` 后仍在 `rootPath` 之内,否则 403。
- **token-gate blob 路由**:presign 返回的 URL 带一个 HMAC 签名 token(含 key+method+exp,用 server secret `CREATOROS_BLOB_SECRET` 或进程随机派生),blob 路由校验 token 才放行 PUT/GET。防任意写盘/读盘。
- **rootPath 合法性**:设置里改路径时,服务端校验路径可写(mkdir -p 试探 + 拒绝系统敏感目录如 `/`、`/etc`);失败回错误,不静默。

## 分层任务(TDD,逐层 red→green→commit)

### B-T1 契约:settings.storage 读写 op
- Files: `contract/src/operations/settings.ts`, `contract/src/resources/settings.ts`, `contract/tests/{modules/settings,registry}.test.ts`
- `storageConfigResource = { backend: enum[local,s3], rootPath: string, usedBytes: number, totalBytes: number, breakdown: [{assetType,bytes}] }`(usedBytes/totalBytes/breakdown 是只读的真实用量,backend/rootPath 是配置)。
- `getStorage`:`{ id:"settings.storage.get", GET /settings/storage, response: storageConfigResource, fr:["FR-SETTINGS-STORAGE-GET"] }`。
- `putStorage`:`{ id:"settings.storage.put", PUT /settings/storage, body:{ backend?:enum, rootPath?:string }, response: storageConfigResource, fr:["FR-SETTINGS-STORAGE-UPDATE"] }`。
- registry 期望路由表加 2 行 + 契约测试断言。

### B-T2 backend schema:storage_configs 表 + 迁移 0002
- Files: `backend/src/schema/settings.ts`(或新 storage.ts), `backend/drizzle/0002_*.sql` + journal
- `storage_configs(user_id TEXT PK, backend TEXT NOT NULL DEFAULT 'local', root_path TEXT NOT NULL DEFAULT '', created_at, updated_at)`。空 root_path → 服务端解析成默认 `~/CreatorOS/media`。

### B-T3 local-fs 适配器 + blob 路由
- Files: `frontend/src/server/modules/assets/localfs-object-storage.ts`(新), `frontend/src/app/api/v1/blob/[...key]/route.ts`(新), 单测
- `createLocalFsObjectStorage({ rootPath, publicBaseUrl, signToken }, { nextKey })`:
  - createPresignedUpload:`storageKey=${assetType}/${nextKey()}`;写 sidecar `${rootPath}/${key}.meta.json`(declared mimeType/fileSize/dims);`uploadUrl=${publicBaseUrl}/${encodeKey(key)}?token=${signToken(key,'PUT')}`。
  - headObject:校验 key 安全 → `fs.stat(${rootPath}/${key})` 取 fileSize + 读 sidecar 取 mimeType/dims + 算 checksum(sha256 文件)。
  - getSignedUrl:`${publicBaseUrl}/${encodeKey(key)}?token=${signToken(key,'GET')}`。
- blob 路由 `PUT/GET /api/v1/blob/[...key]`:校验 token + 路径穿越 → PUT 写盘(mkdir -p)、GET 流式读盘。
- 纯函数(safeJoin/path 校验/token 签验)抽出单测;route + adapter 用 tmp dir 集成测。

### B-T4 service+repo:storage 配置 + 真实用量
- Files: settings.repository/service/schema.ts, 集成/单测
- repo:`getStorageConfig(ctx)/putStorageConfig(ctx, patch)`(user-scoped upsert)。
- service:`getStorage(ctx)` = 读 config + `resolveRootPath`(空→默认 `~/CreatorOS/media`,展开 `~`)+ 真实用量:`SELECT asset_type, SUM(file_size) FROM asset_files JOIN assets ... WHERE assets.user_id=ctx.userId GROUP BY asset_type`(usedBytes/breakdown);totalBytes 用 `fs.statfs(rootPath)` 的磁盘容量。`putStorage(ctx, patch)`:校验 rootPath 可写后落库。
- service 测试(用量 SUM、默认路径展开、非法路径拒绝)。

### B-T5 resolve/接线:persistence-client 选 local-fs
- Files: `persistence-client.ts`
- 选择优先级改为:**读该 user 的 storage_config:backend=s3 且 S3 env 齐 → S3;否则 backend=local → createLocalFsObjectStorage(resolveRootPath)**;两者都不可用 → mock。保留 `S3_BUCKET` env 作为 s3 后端的凭据来源。
- 注:objectStorage 现在是 per-ctx 还是 singleton?勘查接线(863 是 buildPersistence 单例)——storage 配置是 per-user,但 buildPersistence 是单例装配。需把 objectStorage 选择改成**按 ctx 懒解析**(或 AssetsService 调用时按 ctx 取 config 选 adapter)。这是本切片最难的接缝,实施时先确认装配粒度再定方案(可能引入一个 `objectStorageForCtx(ctx)` 工厂)。

### B-T6 transport+契约装配:注册 settings.storage.* 
- Files: settings.transport.ts(SETTINGS_OP_IDS + case), 契约 transport 测试。

### B-T7 UI:StorageUsageCard 做真 + 读真值
- Files: settings-interactive-region.tsx(StorageUsageCard), settings-page.tsx(StorageState 换真形状 + 读), fixtures/selectors/settings.ts, page.tsx(读 settings.storage.get), 各测试 VM
- StorageUsageCard:显示**真实路径(可编辑 input + 保存按钮)+ 当前后端 + 真实已用/磁盘容量进度条 + 按类型 breakdown**;保存走 `settings.storage.put`。替掉假 GB。
- StorageState 类型:`{ backend, rootPath, usedBytes, totalBytes, breakdown:[{assetType,label,bytes,tone}] }`。

### B-T8 验证(eval 门)
- 契约/后端/前端 settings 全测绿 + typecheck 绿。
- **真链路冒烟**(重启 server 后,LOCAL 后端):设置里设 rootPath=临时目录 → 上传一个素材 → 字节真落 `<rootPath>/<key>` 磁盘文件(`ls` 确认)→ StorageUsageCard 显示真实已用 > 0。
- 路径穿越/无 token 的 blob 请求被拒(403)。

## 不在本切片(item B 边界)
- 把现有 MinIO 里的对象迁移到本地盘(新对象走本地;旧对象不迁)。
- 云 S3(AWS)凭据 UI(S3 后端暂仍走 env,设置里只切 backend + 路径)。
- 缩略图/转码。
