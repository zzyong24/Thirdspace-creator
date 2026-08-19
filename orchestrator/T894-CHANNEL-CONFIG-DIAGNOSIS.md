# T-894 渠道用户配置未加载诊断

日期：2026-08-19  
范围：只读分析用户加密日志、CreatorOS 渠道配置读取链路、Growth 生产日志与匿名化一致性统计；未修改用户激活、渠道配置、模型密钥或线上数据。

## 结论

这不是装错渠道包，也不是激活失败。用户在 `05:51:02Z` 后已经取得 `licensed=true / status=active` 的有效授权，Growth 也持续以 HTTP 200 返回了与该授权匹配的渠道配置包。

真正失败的是下一步领取 `omnihi-main` 托管凭据：Growth 的 `/api/client-config/managed-credentials/current` 持续返回 HTTP 503。继续核对上游后确认，OmniHi 登录和 API Key 列表请求本身都是 200；问题出在 Growth 的 OmniHi 适配器只读取列表第一页，没有处理分页：

- Growth 数据库中有 34 条 `active` 的 OmniHi 托管凭据；
- OmniHi 列表接口报告 `total=33`，默认 `page_size=20`；
- 第一页只有 20 条，第二页还有 13 条；
- 当前适配器不翻页，因而会把第二页的 13 条有效 Key 误判为不存在；
- 另有 1 条 Growth 仍标记为 active、但 OmniHi 全量 33 条中确实不存在的历史孤儿 Key，需要单独自愈。

该用户的安全日志没有输出权益绑定或 provider key id，所以不能在不泄露敏感绑定的前提下区分其命中的是“第二页 Key”还是那 1 条历史孤儿 Key；但已能确认其命中了“Growth 中已有 active 凭据、OmniHi 首屏回读未匹配”的同一失败分支。现有 14 条首屏不可见记录中，13 条由未翻页直接造成。

CreatorOS 又把“保存已验签渠道配置”和“领取托管凭据”做成了全成全败：凭据 503 发生在 `store.save(next)` 之前，因此前面已经成功取得并验签的渠道配置也不会落盘，首装用户只能回退到空的本地模型配置。随后日志中的“未配文本模型”和 `LlmCredentialError` 是这个故障的下游结果。

```mermaid
flowchart LR
  A["用户授权有效"] -->|200| B["Activity 签发配置票据"]
  B -->|200| C["Growth 返回并验签渠道配置"]
  C --> D["Growth 查询 OmniHi 托管 Key"]
  D --> E["只读第 1 页：20 / 33"]
  E --> F["较早 Key 未匹配，返回 503"]
  F --> G["CreatorOS 丢弃本次已验签配置"]
  G --> H["回退本地配置，模型显示未配置"]
```

## 证据时间线

| 时间（UTC） | 证据 | 判断 |
| --- | --- | --- |
| 05:48:47–05:48:52 | 本地 verdict 为 inactive，配置同步报 `CLIENT_CONFIG_LICENSE_UNAVAILABLE` | 激活前的预期阻断 |
| 05:51:02 起 | 本地 verdict 变为 `licensed=true / active` | 激活已经成功 |
| 05:51:06 起，多次 | Growth `bundles/current` 返回 200，Activity introspection 返回 200 | package/channel 身份、票据和配置读取均有效 |
| 05:51:08–06:16:28，多次 | `managed-credentials/current?serviceId=omnihi-main` 返回 503，本地映射为 `CLIENT_CONFIG_AUTHORITY_UNAVAILABLE` | 失败集中在托管凭据回读 |
| 同一请求窗口 | OmniHi `/auth/login` 200，`/user/apikeys` 200；没有创建或 reveal 请求 | 不是 OmniHi 登录失败，也不是新 Key 创建失败 |
| 只读匿名化核对 | DB active=34；OmniHi page1=20、page2=13、total=33；全页匹配 33，真实孤儿 1 | 未翻页是批量误判主因，另有 1 条需自愈 |

## 已排除

- **装错包 / package project identity 不一致**：若发生会是 `CLIENT_CONFIG_PRODUCT_IDENTITY_INVALID`，日志没有。
- **渠道身份缺失**：若 verdict 缺 `projectKey/channelRef` 会是 `CLIENT_CONFIG_ACTIVATION_SCOPE_MISSING`，日志没有。
- **激活失败**：05:51 后持续为 active。
- **渠道配置不存在或验签失败**：bundle 接口持续 200，客户端没有 `NOT_FOUND`、identity mismatch 或 signature invalid。
- **Growth 整体宕机**：API、Activity introspection 和 bundle 路径都正常；故障只发生在托管凭据回读。
- **OmniHi 账号登录失败**：登录和列表均为 200。

## 根治范围

### Growth（主修）

1. OmniHi Key 查询必须按 `total/page/page_size` 有界翻页，直到找到目标 `provider_key_id` 或读完全量；不能把默认第一页当全量。
2. 对 DB active、Provider 全量确实不存在的 Key 做显式终态和安全自愈：重新创建确定性名称的受限 Key，或将记录置为可恢复失败后重新 provision；不能长期保持伪 active。
3. `managed-credentials/current` 的安全日志至少记录错误阶段和稳定错误码，例如 `provider_list_paginated_miss`、`provider_key_absent`、`provider_response_invalid`，保留 correlation id，但不得记录 token、激活码或权益绑定原文。
4. 补回归：Provider 有 33 条、目标在第 2 页时必须成功；目标全页不存在时走幂等自愈；分页重复/total 漂移时有硬上界。

### CreatorOS（抗故障）

1. 将“已验签配置包落盘”和“托管凭据拉取”拆成两个可恢复状态，不能因为单个密钥服务瞬时失败而丢弃整个合法渠道配置。
2. 首装且凭据暂不可用时显示“渠道配置已取得，模型凭据同步中”，只禁用依赖该凭据的模型能力；凭据重试成功后再原子启用。
3. 对凭据请求做有界退避，避免启动阶段重复拉 bundle + credential 的重试风暴。
4. 补回归：bundle 200 + credential 503 时 bundle/LKG 仍保存；下一次仅重试凭据；凭据恢复 200 后 authority 切为 channel。

### Activity

无需修改。此次 ticket 签发和 introspection 均为 200，授权边界工作正常。

## 当前状态

本报告完成了根因定位，尚未修改 Growth 或 CreatorOS 代码，也没有触碰用户账号和线上配置。要让现有受影响用户恢复，需要同时修 Growth 分页/孤儿 Key 自愈，并修 CreatorOS 的全成全败落盘顺序；只让用户重装或重新激活不能根治。
