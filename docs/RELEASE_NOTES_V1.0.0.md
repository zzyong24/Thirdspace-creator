# CreatorOS 1.0.0 发布说明（候选草案）

> 状态：Release Candidate，尚未创建 tag、GitHub Release 或分发安装包。

CreatorOS 1.0.0 把内容创作主线、桌面发布安全和渠道受管模型能力收敛到同一个可审计候选。

## 用户可见更新

- Copilot 支持项目全生命周期上下文、可信选区局部改稿、脚本版本查看/恢复和附件上下文。
- 写稿支持“原文不改”的逐字保真候选；模型不重写原文，用户采纳后才落稿。
- 项目稿面退役“论点骨架”，新的写稿与制作直接使用 Brief、脚本和项目素材。
- 视频制作补齐素材语义匹配、横竖屏画幅、成片预览、局部调剪和重新制作闭环。
- 素材包导出不再回流为普通素材；大素材库与项目素材使用完整分页。
- 设置页提供 Growth 用户端 AI 额度连接、查看、刷新和充值入口，不暴露供应商、Base URL 或 Key。
- 渠道包支持独立品牌、图标、数据目录和可信更新命名空间。

## 安全与发布

- CreatorOS 使用 Activity `config-access-ticket-v3` 获取 Growth 已签名配置；长期受管凭据只进入系统
  密钥库，ASR 使用短时 lease。
- macOS 正式流水线缺 Developer ID 或公证凭据即失败；上传前强制检查签名、公证、staple、
  Gatekeeper、DMG 内层 App 和真启动主页面。
- 正式版本字段、Rust lock、安装包 manifest 与 Growth `clientVersion` 统一为 `1.0.0`。

## 已知发布边界

- Windows 正式代码签名尚无本轮 Authenticode/Azure Trusted Signing 证据；在关闭前属于 High 风险，
  不能宣称 Windows 正式发布就绪。
- J-142 的真实渠道首次 5 元额度和 OmniHi Key 创建尚未在本任务消费真实一次性码验证；共享码不会
  产生经济事实。
- 本文是候选说明，不授权创建 `v1.0.0` tag、发布 Release、上传/分发安装包或修改生产版本公告。
