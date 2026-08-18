# 渠道包最小输入

必需：合作伙伴公司名、品牌名、精确 Activity/Growth `channelRef`、macOS `.icns`、Windows `.ico`、目标平台。购买、续费、下载、反馈、客服等渠道专属 HTTPS URL 不再要求，新渠道统一不填，反馈走官方入口；历史 manifest 中的链接字段仅做向后兼容校验。

完整 Growth 配置另需当前 `productConfig` 的权威来源；输出固定为：

- `channel-partners/<合作伙伴公司名>/growth-channel-service.input.json`（六字段精简输入）；
- `channel-partners/<合作伙伴公司名>/growth-product-config.json`（`channelService + productConfig` 完整配置）。

用户已取消渠道打包的截图、像素与视觉回归。当前只执行静态品牌 surface 契约、系统应用名/identifier/
图标清单、安装身份与真实进程检查。侧栏配色是 PackageManifest 的可选 `theme.sidebar` 输入：填写时
按渠道编译，未填写时不注入任何主题变量并保持 CreatorOS 原配色；共享组件不得写死渠道名或渠道色值，
也不得借打包任务修改业务交互。

更新必需：包级更新 HTTPS origin、共享 runtime HTTPS origin。二者可使用同一域名；阿里云 OSS 可作对象存储源站，Edge CDN 可作加速层，但上线前必须通过 HTTPS、Range、ETag、Content-Length、跨域重定向和缓存不可变性探针。

GitHub 正式构建另需：macOS Developer ID 与公证凭据、Tauri updater 私钥。Windows Authenticode
证书当前可缺省，但必须标记 `unsigned-accepted-risk`；以上材料不写 PackageManifest、不提交 Git。

集中 release root：

- keyId：`creatoros-update-root-20260805-01`
- 私钥（仅本机，0600）：`/Users/zyongzhu/.config/creatoros-release/keys/creatoros-update-root-20260805.pem`
- 公钥（仅本机）：`/Users/zyongzhu/.config/creatoros-release/keys/creatoros-update-root-20260805.pub.pem`
- 仓库公钥副本：`frontend/branding/trust/creatoros-update-root-20260805.pub.pem`
- DER 公钥 SHA-256：`54f51d62d88b4bf429acef9a21d869a9a0957e1695d79938c00bff7e869f8a4c`

不要在日志、文档或聊天中粘贴私钥内容。
