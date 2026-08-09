# T-698 Growth 生产上线与 CreatorOS 0.3.0 本地包证据

日期：2026-08-05

## 结论

- Growth 生产环境已上线运行时代码 `067fb222117d7eb65897ce8d2396a7c626bb97cb`。
- CreatorOS 已用同一组公开 `keyId` / Ed25519 公钥构建本地 macOS 0.3.0 测试包，渠道配置拉取在构建时启用。
- Growth 签名私钥只部署在生产服务器仓库外，权限为 `0600 thirdspace:thirdspace`；未进入 Git、CreatorOS 安装包或公开响应。
- 本地包按用户确认的快速验收口径，不做 Developer ID 签名、公证或 updater 发布。

## Growth 生产部署

- GitHub `main` 业务代码 commit：`067fb222117d7eb65897ce8d2396a7c626bb97cb`
- 生产 release：`/opt/thirdspace/releases/067fb222117d7eb65897ce8d2396a7c626bb97cb`
- 可回滚 release：`/opt/thirdspace/releases/4ed6d2c8ae9e070e306d9a495c59cc6c9bd5d21d`
- 发布证据文档 commit：`384819f`（只记录证据，未触发重复部署）
- 数据库 schema：`0049_t133_model_credentials`
- API / worker：`active`
- `/health/live`：`200`
- `/health/process-ready`：`200`
- `/health/ready`：`503`，原因仅为正式交易支付 provider 尚未启用；不阻断当前渠道配置、商品、代理、库存、发码及客户端配置能力。
- 数据库热备、最终停写备份、SHA 校验与 PostgreSQL 16 隔离恢复：通过。
- Activity 发布前后运行指纹：一致，本次未修改 Activity。
- 配置 bundle 与私密凭证接口未登录访问：均为 `401`。
- 公共响应和服务日志密钥泄露扫描：通过。
- `keyId`：`growth-client-config-20260805-01`
- Growth 签名、公钥匹配、bundle 验签：通过。

生产库存在发布前即有的约束 / 索引模型漂移。本次 release 没有 schema 变更，migration head 与代码一致，fresh DB 的 `alembic check` 通过；未为上线擅自删除既有生产约束。

## CreatorOS 本地 macOS 包

- 版本：`0.3.0`
- Bundle identifier：`cloud.aitongban.creatoros`
- 构建 profile：`release-fast`
- 渠道配置拉取：启用
- Growth origin：`https://growth.aitongban.cloud`
- `keyId`：`growth-client-config-20260805-01`
- 最终 `.app` 内可检索到上述 `keyId` 与对应公开公钥；私钥不在包内。
- DMG：`/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_0.3.0_aarch64.dmg`
- 大小：`405313611` bytes（约 `386.5 MiB`）
- SHA-256：`ad7565a5ce1da6ab5615e770e981148fe0abc85ecdbf255ff139af861b71f004`
- `hdiutil verify`：通过。
- 代码签名：`false`（本地测试包）
- 公证：`false`（本地测试包）
- updater：未生成（未配置 updater 私钥，符合本地快速验收口径）。

构建过程还通过了生产 Next.js 编译、内置课程包校验、sidecar 真启动冒烟、Node/TLS/Chromium/Playwright、FFmpeg/ffprobe、Whisper/ONNX 自包含检查和 verdict 公私钥匹配检查。

## 尚待真实联调的边界

J-133 保持诚实的 `NO-GO`：还缺真实 Activity 权益、CreatorOS 正式签名发布包，以及文本、图片、视频三类真实调用回执。本任务不制造 fixture 或伪造回执；上述缺口不影响 Growth 已上线和本地 0.3.0 包开始渠道激活码联调。

## 治理收口

- `node orchestrator/process/pmem.mjs sync`：通过。
- `node orchestrator/process/reconcile.mjs`：本任务涉及的 orphan、asset、boundary、knowledge、docs 与 lesson 门均通过；全局仍有 11 个与本次上线/构建无关的既有 review/frontend receipt 漂移及 1 个 BACKLOG 体积警告。未把这些历史欠债伪报为全绿，也未在本次发布任务中扩张修复范围。
