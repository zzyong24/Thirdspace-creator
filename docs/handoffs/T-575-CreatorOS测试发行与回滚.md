# T-575 CreatorOS 测试发行、安装与回滚

> 适用版本：`0.2.1-beta.2`
> 发布性质：三系统在线联调测试版，不是公开正式版
> 固定 Growth origin：`https://growth.aitongban.cloud`

## 1. 发行边界

- 只通过 GitHub `v0.2.1-beta.2` tag 触发 `desktop-release`，产物进入 **draft Release**。
- 这次只生成 macOS DMG；Windows 测试包不生成，未来仅允许通过手动工作流显式选择
  `windows` 或 `all`。不修改、不上传、不覆盖公开
  `sites/creatoros/updates/latest.json`，现有 `0.2.0` 用户不会收到该测试版。
- 包内显式开启权益领取与纯文字问题反馈，两个能力都只允许访问
  `https://growth.aitongban.cloud`；跨 origin redirect、用户输入地址和渠道 URL 均不能替代。
- updater minisign 与本仓 verdict 签名继续使用 GitHub Actions 已配置的测试凭据。Apple
  Developer ID / notarization 与 Windows 公信代码签名本轮未启用，因此安装时出现系统安全
  提示属于已知测试版边界，不能把该包描述为正式签名发行。

## 2. 安装测试版

### macOS

1. 从 draft Release 下载 `.dmg`，记录并核对本手册后续回填的 SHA-256。
2. 打开 DMG，将 CreatorOS 拖到 Applications。
3. 若 Gatekeeper 因测试版未做 Developer ID 签名而阻止首次打开，只在确认下载来源和
   SHA-256 后，进入“系统设置 → 隐私与安全性”，对本次 CreatorOS 选择“仍要打开”。
4. 启动后确认版本显示 `0.2.1-beta.2`，再进入 `/activate` 做领取联调。

## 3. 三系统 HTTPS E2E

以下步骤必须使用测试渠道下的真实数据库记录，不得用 CreatorOS 本地 fixture 冒充：

1. Growth 已存在本人可领取的已支付 entitlement；其交付模式为
   `growth-entitlement-delivery-v1 / activation_claim`。
2. CreatorOS 激活页点击“领取已购买权益”，只能向固定 Growth origin 调用 API-210，页面显示
   短期 `userCode` 和不含 query/fragment 的验证页。
3. 在 Growth 登录态验证页选择本人 entitlement 并完成 reauth；CreatorOS 只轮询 API-212，
   不调用浏览器批准 API，也不读取 Growth Cookie。
4. API-212 批准后，CreatorOS 必须先把 exact replay 所需数据写入 OS protected
   pending-consume journal，再调用 AM
   `POST /api/license/entitlement-claims/consume`。
5. AM 返回签名成功后，CreatorOS 完成 raw digest、Ed25519、date、nonce 与 request 绑定校验，
   原子替换 `.license` 并读后验真；只有这些全部成功才清理 journal。
6. 重启 CreatorOS，确认授权仍有效，购买、续费、渠道售后、产品反馈和下载入口来自同一份已验签
   `channel-runtime-v2`，且页面不显示内部 `projectKey/channelRef/token/digest`。
7. 在问题反馈弹窗中预览纯文字和高级诊断后确认发送；CreatorOS 先取得 AM 签名反馈上下文，再向
   Growth 固定 `/api/v2/product-feedback` 提交。只有真实 closed `202` 回执的 `publicRef`
   可以显示为“反馈已收到”。
8. 分别验证过期、撤权、断网、Growth 5xx、AM 坏签名与响应丢失：旧授权不得被破坏，反馈草稿
   必须保留，不能把“已打开网页”或历史成功冒充本次提交成功。

E2E 证据至少记录：测试时间、CreatorOS commit/tag、GitHub Actions run、Growth/AM 部署
commit、脱敏 entitlement/claim/反馈 publicRef、最终状态、macOS DMG SHA-256。不得记录
claimToken、activation code、手机号、机器标识、Cookie、私钥或反馈正文。

## 4. 回滚

1. 远端先关闭 Growth claim-session 能力并让反馈接口 fail-closed；CreatorOS 应显示暂不可用，
   旧激活状态和本地反馈草稿保持不变。
2. 不发布 draft Release，不修改公开 `latest.json`，不把测试版链接写入正式渠道
   `downloadUrl`。
3. 需要退回客户端时卸载 `0.2.1-beta.2`，从现有正式渠道重新安装 `0.2.0`。卸载前按产品已有
   备份流程保存用户工作区；回滚不得主动删除现有 `.license` 或用户内容。
4. Git 回滚以 `pre-t076-live-20260727` 为代码基线；测试 tag 只新增，不移动、不覆盖。

## 5. 当前发布证据

- 本地 T-575 前端定向测试：45/45 PASS。
- Rust entitlement claim 定向测试：7/7 PASS。
- TypeScript、Next production build、Rust release `cargo check --locked`：PASS。
- `reconcile.mjs`：0 error；`boundary-scan.mjs`：0 新增违规。
- CreatorOS commit：`5539eba662cc096a5f2295e0b51971a26d080755`；tag：
  `v0.2.1-beta.2`。
- GitHub Actions run：
  `https://github.com/zzyong24/Thirdspace-creator/actions/runs/30343144793`。macOS build
  `success`；用户确认本轮不生成 Windows 后，Windows lane 与 run 被主动取消，不视为 macOS
  包失败。
- draft Release：
  `https://github.com/zzyong24/Thirdspace-creator/releases/tag/untagged-2c0808c7d0f55eefe02e`，
  状态为 `draft`，只含 `CreatorOS_0.2.1-beta.2_aarch64.dmg`。
- DMG 大小：`448258846` bytes；SHA-256：
  `dac146f12c5e1e692ad2b2ae745bb211f0610033b30a7f234b83154bf97caeac`。GitHub Release
  asset digest 与本地独立计算逐字一致。
- 公开 `https://creatoros.aitongban.cloud/updates/latest.json` 仍为 `0.2.0`，未被测试版覆盖。
