# 渠道包最小输入

必需：合作伙伴公司名、品牌名、精确 Activity/Growth `channelRef`、购买/续费/下载/反馈/客服五个 HTTPS URL、macOS `.icns`、Windows `.ico`、目标平台。

完整 Growth 配置另需当前 `productConfig` 的权威来源；输出固定为：

- `channel-partners/<合作伙伴公司名>/growth-channel-service.input.json`（六字段精简输入）；
- `channel-partners/<合作伙伴公司名>/growth-product-config.json`（`channelService + productConfig` 完整配置）。

白标视觉验收固定检查：系统应用图标与名称、原生窗口标题、HTML 页面标题、侧边栏品牌名与品牌图标，并保留实际安装应用截图。只有 Finder/Dock 图标改变不算完成。

更新必需：包级更新 HTTPS origin、共享 runtime HTTPS origin。二者可使用同一域名；阿里云 OSS 可作对象存储源站，Edge CDN 可作加速层，但上线前必须通过 HTTPS、Range、ETag、Content-Length、跨域重定向和缓存不可变性探针。

发布时另需：macOS Developer ID 与公证凭据，Windows Authenticode 证书，Tauri updater 私钥。以上材料不写 PackageManifest、不提交 Git。

集中 release root：

- keyId：`creatoros-update-root-20260805-01`
- 私钥（仅本机，0600）：`/Users/zyongzhu/.config/creatoros-release/keys/creatoros-update-root-20260805.pem`
- 公钥（仅本机）：`/Users/zyongzhu/.config/creatoros-release/keys/creatoros-update-root-20260805.pub.pem`
- 仓库公钥副本：`frontend/branding/trust/creatoros-update-root-20260805.pub.pem`
- DER 公钥 SHA-256：`54f51d62d88b4bf429acef9a21d869a9a0957e1695d79938c00bff7e869f8a4c`

不要在日志、文档或聊天中粘贴私钥内容。
