# T-575 CreatorOS 配置联调测试版 beta.3

> 目标版本：`0.2.1-beta.3`
> 平台：仅 macOS arm64 beta
> 当前状态：**代码与本地 BUILD 已就绪；缺正式公开验签材料和发布签名材料，尚未出包。**

## 1. 本版范围

- 保留 beta.2 已有的 device authorization、OS protected pending-consume journal、AM exact
  replay、正式授权原子落盘和产品反馈链路。
- 新增 Activity 短票 → Growth signed product bundle → CreatorOS 产品 parser。
- 新增 AES-256-GCM LKG、24 小时受限离线容错、撤权/过期/重放/低版本/同版冲突 fail-closed。
- sidecar 就绪、旧激活成功、新 claim 成功后刷新；持续运行按 6 小时加最多 15 分钟抖动刷新。
- capability 默认关闭；beta.3 不改变商业或 entitlement 权威边界。

## 2. 出包前必须由受控发布环境提供

仅检查变量存在，不在日志回显值：

- `CREATOROS_CLIENT_CONFIG_PULL_ENABLED=1`
- `CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN=https://growth.aitongban.cloud`
- `CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64`
- `CREATOROS_GROWTH_CONFIG_KEY_ID`
- `CREATOROS_LICENSE_BASE_URL=https://license.aitongban.cloud`
- `CREATOROS_LICENSE_PUBLIC_KEY_B64`
- `GROWTH_ENTITLEMENT_API_ORIGIN=https://growth.aitongban.cloud`
- `CREATOROS_VERDICT_SIGNING_KEY_B64`
- 既有 macOS codesign/notarize 与 Tauri updater 私钥变量。

Growth 的两个配置验签值必须对应部署端
`THIRDSPACE_V2_CLIENT_CONFIG_SIGNING_PRIVATE_KEY_PATH` /
`THIRDSPACE_V2_CLIENT_CONFIG_SIGNING_KEY_ID`；CreatorOS 只接收公钥与 keyId，禁止读取或复制
Growth 私钥。

## 3. 打包与验收

1. 先重跑 `orchestrator/GATE-T575-BUILD.md` 中的定向、typecheck、Rust、fixture、boundary
   Gate。
2. 在受控发布机只执行 macOS arm64 打包，不运行 Windows target。
3. 产物文件名必须含 `0.2.1-beta.3`；不得覆盖 beta.2，不创建 `latest`，不 push tag，不公开
   Release。
4. 真机从未激活、旧激活、已领取、过期、撤权、离线、服务不可达各走一遍；页面只显示人话
   状态，不能出现 token、digest、signature、projectKey 或 channelRef。
5. 用真实线上 Growth/Activity 完成 claim consume、config pull、反馈 `202 publicRef`，只记录
   非敏感 correlation/request ID，并由两端权威日志/查询回读。
6. 强杀覆盖 journal prepared、attempted、AM commit 后丢包、`.license` replace 前后；同
   requestId/digest replay 成功且授权读回后 journal 才删除。

## 4. 回滚

- 配置能力异常时，先把新包的 `CREATOROS_CLIENT_CONFIG_PULL_ENABLED` 构建值恢复为 `0`，
  重新生成唯一 beta；不发送清空 tombstone，不删除已验证 T-534 runtime。
- 领取或反馈异常时分别关闭其既有构建期开关；旧激活码继续可用。
- 客户端需要整体回退时卸载 beta.3，回到已验证的 beta.2 或正式版；不得用同版本覆盖安装包。
