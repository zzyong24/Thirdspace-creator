# T-1048 后端、合同与 Worker 交付

仅隔离快照改动，相对接任务时快照的 delta；不包含此前 WIP。源码/测试/vendor 28 文件。`baseHashes.json` 仅 changedFiles 的前像子集，新增文件为 null；`files/` 是完整后像，`finalHashes.json` 是后像 SHA256。排除了 node_modules、dist、缓存；没有前端入口、控制面或模型配置改动。主会话已同步的三个合同文件可跳过重复 patch。

## 接线

- `GraphicPostMediaPorts.findTaskByAttempt? (ctx, 'cover.generate'|'graphic.card.generate', attemptId) => Task|null`：沿真实 AI 服务查询原 attempt，丢 ACK 时先回读原冻结任务。
- `GraphicPostMediaPorts.assets.readImageReference?`：沿 AssetsService 原端口读取精确参考文件、checksum、mimeType；series 请求指定参考时必须可用。
- `CoverExecutionPorts.getReferenceBytes(ctx,assetId,assetFileId?) => {bytes,mimeType}|null`：有 fileId 用 readImageReference，无 fileId 保留原 getAssetBytes。
- Canvas 原 getReference(ctx,id,fileId?) 接线不变，现在提交持久 node.referenceFileId；已知 link.taskId 只核验原任务与冻结输入，不再 submit。未知 ACK 仍沿原 attempt 恢复。

## 已实现

可选 seriesProfile、visualBrief 和 canvas referenceFileId 向后兼容；复用 targetSectionId 指定真实图文 cardId。冻结有序全组/共享方向/精确参考证明，公共 prepare 重读原版本核验。只替换该页文件，其他页及旧照片不动；旧孤立 cardId 图片保留原位置。同批依次采用用当前 CAS，正文/来源/页顺序/风格变化不能覆盖新稿；原回执重放与失败局部重试沿既有 owner/bundle。候选首次 file 绑定后不追 currentFile。

两个原可配置 Skill 模板升到 2.0.0 并载入 MIT baoyu 连续阅读、逐页大纲、统一参考与局部重做方法。固定上游 commit 1567581c26ec29f4216c6e6835415bf30343b0e3，完整选用源、LICENSE、来源和 SHA256 在 vendor/provenance.json；不执行上游脚本、不硬编码语义风格选择、不强制参考或固定页数。真实指定 reference file 和画幅经原封面两次模型调用进入图片准备/读取；供应商不支持参考时真实拒绝，不假称使用。旧只指定 Asset 的封面降级路径保留。

## 验证与限制

证据目录 `docs/research/evidence/t1048/`。Contract 2 文件 4 PASS；Worker 5 文件 8 PASS；后端相关 12 文件 84 PASS，最后 Canvas known-link 优化后针对当前代码的 2 文件 13 PASS，冻结后完整当前代码回归 `backend-regression-frozen.log` 为 12 文件 84 PASS。所有模型、Asset 字节端口测试均为明确注入的 fixture；PGlite owner/版本/bundle/回执是真实服务。没有真实模型图片生成、UI 或三页真实图片验收 PASS。

行为红测是本轮实际执行：合同字段、指定页 prepare、候选精确文件和页替换、模板方法、参考证明缺失、旧来源保留、孤立旧 cardId、原图片准备端口。首次 execution 测试 fixture 模型身份不合合同，保留 `execution-test-fixture-setup.log`，修 fixture 后的 `execution-red.log` 才是有效行为 RED。

并发整套数据库测试曾 5 秒超时，保留原失败日志；最终串行 maxWorkers=1、testTimeout/hookTimeout=20000，没有自动 retry。Canvas 测试曾把可更新 updatedAt 当幂等固定字段，最终断言实际稳定任务/输入/精确参考；最终实现同时不再重复 submit 已知 link。

Worker全类型检查通过。Backend全类型检查 exit2；`backend-types-delivery.log` 保留既有未触碰文件的错误，当前本次新增/修改文件没有错误。未跑独立 HEAD 类型基线，不能把全仓类型 Gate 写为 PASS。真实模型/主机 UI/审核与导出由主会话继续验收，任务不能凭此交付标完成。
