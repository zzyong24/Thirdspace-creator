# T-1055 后端隔离交付证据

源码冻结在 `/tmp/t1055-backend/delivery/`，`delivery-manifest.json` 包含 18 文件的 before/after SHA-256，`t1055-backend.patch` 为对应补丁。生成交付时所有根原件 SHA 与初始 source-before.json 一致。仅允许范围内的 application/port/service/contract/两原 Worker/组合根接线改动；静态课程 JSON 只为隔离类型检查复制，不交付。

## 原始红测与修复
- `contract-red.log`：1 failed / 2 passed。
- `worker-red.log`：2 failed / 10 passed。
- `source-red.log`：1 failed / 3 passed。
- `service-red.log`：9 failed / 45 skipped，按 T-1055 名称聚焦。
- `auxiliary-invalid-red.log`：损坏辅助端口会返回坏对象的真实失败，修复后在全量 source 回归通过。
- `backend-green-first.log`：第一轮回归发现 graphic 手工保存错引用局部变量，已修复并保留失败日志。

## 已完成的验证
- `backend-delivery-green.log`：3 files / 64 tests passed，retry=0（source 8、article 37、graphic 19）。最后清理一个新增 unused 解构变量后，`graphic-delivery-final-green.log` 再次 19 tests passed。
- `contract-final-green.log`：6 files / 32 tests passed，retry=0。
- `worker-final-green.log`：3 files / 13 tests passed，retry=0。
- `contract-typecheck-delivery.log`、`worker-typecheck-delivery.log`：tsc --noEmit 成功。
- `frontend-typecheck-frozen.log`：组合根与合同接线 tsc --noEmit --incremental false。
- `backend-production-typecheck-delivery.log`：生产代码沿原 compilerOptions 类型检查；evidence 中独立 config 只排除测试源码、定位隔离 @types，不修改项目 tsconfig。
- backend 原全量 `tsc --noEmit` 不通过：baseline 和 delivery 都有 74 个原有测试诊断，按文件 + TS 编码计数无新增，生产文件无诊断。原日志在 `backend-typecheck-baseline.log`、`backend-typecheck-delivery.log`；比对 `backend-typecheck-delivery-delta.json`。不记录为全量 PASS。
- 改动文件 eslint baseline 与 delivery 同 9 errors / 11 warnings；归一化行号后诊断无新增。日志和比对在 `changed-files-lint-*`。不记录为全量 lint PASS。

## 关键真实边界
原主稿正文读取选择保持；发布物料复用脚本页首 video/当前 revision/真实简介或标签优先规则，未引用文章或图文本身 publication。真实 publishing 服务验证历史 revision 及跨号/跨项目拒绝；辅助读取与损坏输入单独降级，不反杀稿件。

冻结图片目录经 Assets 公开服务给出真实 asset/file/name/description；原 Worker 模板负责语义匹配。Worker 与 backend 都验证 exact pair，旧 ID-only visual hint 合同兼容但不能写 imageUses。采用经旧候选/CAS 写入 section/card，已有目标图片保持。仅自动新图采用调用窄 assertProjectImageFile，以既有 getAssetFileDownloadUrl 检查 exact 物理对象并丢弃签名结果。原手工稿保存图片门未扩大。

source 测试实际写入本地 PNG 文件：更换 current 之后，原冻结历史 file 仍按 exact ID 可读；删除旧字节后失败而非重绑 current；删除 current 字节后目录跳过。article/graphic 新图文件读取失败仍保留合法正文并记录可读提示。

未执行真实模型、浏览器、系统剪贴板或外部平台。模型语义选图的实际效果不能写成 PASS。公共 HTTP 验收、全局 Gate 与根整合由主会话执行。
