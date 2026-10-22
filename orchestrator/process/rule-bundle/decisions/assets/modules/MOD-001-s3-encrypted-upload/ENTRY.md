---
id: MOD-001
kind: module
title: S3 兼容对象存储上传(presigned PUT + env-gated mock/real)
problem_tag: [object-storage, crypto]
when_to_use: 需把上传文件经 presigned URL 真字节 PUT 到 S3 兼容存储(MinIO/S3),并用 env 在 mock 与真实现间切换
when_not_to_use: 仅本地文件、无对象存储需求 → 不需要本资产
keywords: [presigned, s3, minio, aws-sdk, object-storage, env-gated, ObjectStoragePort]
status: active
verified: true
winner: true
superseded_by: null
provenance:
  source: A
  origin_repo: ~/Workbase/Thirdspace-creator
  origin_commit: 664f1354cf2b01d48127a0266ae9e407357c9eb4
  evidence: "CreatorOS task #117-122;MinIO 真上传下载往返集成测试 green(见 files/s3-object-storage.integration.test.ts)"
license: PROPRIETARY(用户自有 · Thirdspace-creator)
files: [./files/s3-object-storage.ts]
example: ./example/example.test.ts
---

# MOD-001 — S3 兼容对象存储上传

## 何时用 / 何时不用
见 frontmatter。核心价值:一个 `ObjectStoragePort` 抽象 + `createS3ObjectStorage`(真,`@aws-sdk/client-s3`)/ `createMockObjectStorage`(测试 / 无 S3),由 `S3_BUCKET` env 选择;前端只对 `http(s)` presigned URL 真字节 PUT,`mock://` 跳过。

## 接法(复用骨架)
1. vendor `files/s3-object-storage.ts`,按你的 `ObjectStoragePort` 接口对齐(presign / complete)。
2. env-gate:`const storage = process.env.S3_BUCKET ? createS3ObjectStorage({...}) : createMockObjectStorage()`。
3. 前端上传:`if (/^https?:\/\//.test(uploadUrl)) await fetch(uploadUrl, {method:'PUT', body:file})`。

## 坑
- `mock://` URL 不能真 PUT,前端必须按协议判。
- presigned URL 过期窗口要和上传大小 / 网络匹配。

## 在 skill 内可跑的 example
`verified` 依据 =(1)CreatorOS 实战交付 + 原仓 green 集成测试(蓝本见 `files/`);(2)**本仓可跑 example** `./example/example.test.ts` —— `node process/assets-runner.mjs --only MOD-001` 判绿(协议判定 + mock Port 往返,零外部依赖)。
