# CreatorOS 渠道合作伙伴目录

本目录按合作伙伴公司名保存渠道交付资料，避免把 Growth 运行时配置、桌面包身份和临时聊天附件混在一起。

每个合作伙伴目录至少包含：

- `README.md`：交付范围、当前状态、缺失输入与权威文件位置；
- `growth-channel-service.input.json`：提交给 Growth 配置套餐的渠道服务字段；
- `package-identity-proposal.json`：首次构建前由用户一次确认的不可变桌面身份建议。

真正参与构建的唯一 `PackageManifest`、`identity.lock.json` 与图标资产仍位于
`frontend/branding/packages/<packageRef>/`，由渠道包脚本执行闭集校验。合作伙伴目录不复制密钥、
激活码、模型凭证或签名材料，也不成为第二份运行时权威。
