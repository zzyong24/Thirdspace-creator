# T-993 无限画布本机候选包验收（2026-09-29）

## 候选与已验证结果

- 源码候选提交：`65781a811da57b50a3446fb74e081143bff317e6`；T-993 仍为进行中。
- 本机产物：`/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg`；SHA-256 `abebecd7bcb760fbda9380b3ae39b21fbf5d55a5071245b09efe906fa90d651c`。`hdiutil verify` 返回 VALID；本包为 ad-hoc 签名，未 Apple 公证，未公开发布。
- DMG、构建目录 `.app`、当前安装的 `/Applications/CreatorOS.app` 均含 `Contents/Resources/THIRD_PARTY_NOTICES.md`，三份 SHA-256 一致：`164b46fc33639cb2e79cba8abea46e7daccc285d9c19343178823e8ec964e962`。DMG 校验时只读挂载，随后卸载。
- 无限画布 6 项浏览器 E2E 整组通过：保存/账号隔离、节点位置尺寸/群组移动/连线、视口与内容版本隔离、触控板滚动与组合键缩放、真实本地图片视频预览、旧 v1 文档/框选批量删除/撤销重做。前端类型检查与生产构建通过；旧入口制作台 B-roll 删除、发布排期、语义素材生成 3 项 E2E 通过；打包基础检查 4 文件 42 项通过。
- 公开 CLI 只读回执：安装版 `status` 为 `connected=true, mode=installed`，完整访问仍启用；`accounts list` 返回 3 个账号；`settings.models.list` 返回 12 条配置，GPT Image 2 与 MiniMax-H3 的 `hasSecret` 均为 true。未输出账号明细或凭据。

## 自动安装副作用与数据核对

本次执行 `pnpm -C frontend desktop:package-local` 以产出候选包。固定脚本在包生成后默认调用安装步骤：删除现有 `/Applications/CreatorOS.app`，把 staging 应用移动到该路径并自动 `open`。因此现有应用包已被候选替换并启动；此前向用户说明的“只构建不覆盖安装”没有兑现，必须如实保留此记录。脚本没有旧应用备份。本次未执行进一步安装、重启、回滚或清理。

运行中的新应用 PID 为 `49897`，版本 1.2.0。用户数据目录仍含 `db`、`.channel-model-config`、`.license`，数据库文件约 732 MB，公开 CLI 可读取账号和模型配置。由于无替换前数据快照，不能证明内容逐字节未变；也未在未选定账号的情况下读取作品明细。下一次只需产出包时应设置脚本已有的 `CREATOROS_LOCAL_SKIP_INSTALL=1`，并在执行前核对其含义。

## 仍待验收

- 用户在两个活跃账号中选定真实账号后，才能按 `creatoros-cli` Skill 固定 `accountId`，验证新画布的文生图、参考图生图、文生视频、首帧图生视频的真实提交、结果回读与采纳；不能把连接测试当成四模式通过。
- Windows NSIS 实包、Apple 公证、完整旧渲染与发布公共链、指定账号作品明细仍未验收。
- 全局 `reconcile` 与边界门卫有既有红项；本报告只陈述实际运行的聚焦验收，不宣称项目全绿。
