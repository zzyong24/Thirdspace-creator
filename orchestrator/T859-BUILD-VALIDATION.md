# T-859 官方渠道图片与视频生成可靠性验证

## 现场证据

- 日志：用户 Windows 真机 `sidecar-2026-08-17.log.enc`，仅在标准输出中解密筛选，未落明文。
- 封面：`cover.brief` 两次成功（45.0 秒、71.8 秒），随后生图 submit 两次均返回
  `ChannelManagedProviderError code=CHANNEL_MODEL_UPSTREAM status=502 retryable=true`，任务被取消。
- 视频：`video.scenes` 成功；`video.cards` 三次均在 120002–120004ms 后返回
  `CHANNEL_MODEL_TIMEOUT stage=model_call`，整条 `video.decisions` 被取消，已有 scenes 未形成候选。
- 同期 `material.generate` 三条均成功并进入 `awaiting_confirmation`，排除 Windows 文件权限、
  项目素材路径或客户端整体无法调用模型。

## 根因与修复

- 封面与普通图片使用同一个 `image.generate`，区别只在提示词来源。普通图片使用精简的素材
  prompt；封面先跑 `cover.brief`。原实现只限制标题/信息点，`visualConcept`、`composition`、
  `palette` 没有任何长度边界。现场两次 brief 输出达到 2793/5021 tokens，随后同一个生图端点
  立即 502，符合超长封面方案被上游网关拒绝的调用形态。
- 现在模板先声明画面字段篇幅，runner 再按 220/100/40 字收口，用户明确画面要求最多保留
  240 字，最终生图 prompt 限在 1000 字内。目标是让封面稳定出图，不追逐供应商理论输入上限；
  标题、主体、动作、构图、色调和末尾“不要额外文字/水印”约束仍会保留。
- 官方图片和视频素材提交遇到明确的 408/425/429/5xx HTTP 拒绝时，沿用同一个
  `Idempotency-Key` 以 1 秒、3 秒退避恢复；网络断开、请求超时和无法解析响应仍不自动重放。
  相同 prompt 的两次独立用户生成把任务意图 ID 纳入指纹，不会错误复用上一张图/上一段视频；
  显式恢复任务继续沿用原意图 ID。
- 制作视频的 `video.scenes` / `video.cards` 从写死 120 秒改为 10 分钟。普通结构节点仍默认
  90 秒，shared runner 保留 15 分钟硬上界，既不再把慢但正常的官方生成掐死，也不会永久卡住。

## 验收边界

- 不修改 T-858 剪辑实现，不覆盖用户账号、模型配置、项目或素材。
- 不在网络未知、客户端超时或响应解析失败后盲目重复可能计费的媒体生成。
- 不用“跳过信息卡”掩盖视频制作超时；按用户要求让完整制作节点获得合理等待时间。
- 覆盖真实错误信封、封面 prompt 边界、图片/视频幂等恢复与节点等待策略；通过聚焦测试、
  相关全套测试、双包类型检查、boundary、reconcile 与 diff-check。

## 可复现验证

### 官方接口真实稳定性探针

仓库提供 `pnpm --filter @creatoros/backend probe:t859-cover-reliability`。它走 CreatorOS 正式的
`createOpenaiImagesAdapter`、`generateImage` 和受管渠道 502 恢复策略：先跑一张普通图片作为同
端点基线，再用当前 `composeCoverImagePrompt` 组装的紧凑封面连续生成三次。每个用户意图使用
独立幂等键，意图内若收到明确 502 等 submit 拒绝才沿用同一键退避恢复。探针只输出提示词长度、
耗时、提交次数、状态、错误分类和响应字节数，不输出 Key、prompt 正文或产物图片，也不写入
CreatorOS 项目/素材库；任一封面最终失败即非零退出，不能把部分成功写成稳定可用。

运行所需的 `OMNIHI_TEST_API_KEY` 必须是源源提供的临时限额测试 Key；上次 T-829 的隔离 Key 已在
测试后撤销，当前机器没有复用凭据。验收目标是实际封面连续可用与 502 可恢复，不再测试没有业务
价值的最大 prompt 长度。

2026-08-16 使用用户当次提供的测试 Key 执行正式探针，Key 只经进程标准输入注入，未写入仓库、
验收文件或 CreatorOS 配置；测试后不再使用：

| 请求 | prompt 字数 | 结果 | submit 次数 | 耗时 | 输出字节 |
| --- | ---: | --- | ---: | ---: | ---: |
| 普通图片基线 | 57 | HTTP 200 | 1 | 42.929s | 2,201,421 |
| CreatorOS 封面 1 | 530 | HTTP 200 | 1 | 45.156s | 1,991,262 |
| CreatorOS 封面 2 | 530 | HTTP 200 | 1 | 43.906s | 2,026,838 |
| CreatorOS 封面 3 | 530 | HTTP 200 | 1 | 44.713s | 2,091,521 |

结论：本次同一官方 `image.generate` 路径 4/4 成功，封面 3/3 成功且都没有触发重试或 502。
这证明紧凑封面 prompt 当前可用；不把 3 次样本夸大成永久 SLA。代码级故障注入另覆盖连续两次
502 后第三次成功，并断言三次沿用同一幂等键，网络未知/客户端超时仍禁止自动重放。

- `pnpm --filter @creatoros/backend exec vitest run src/modules/ai-runtime/cover-runner.test.ts src/modules/ai-runtime/asset-generate-runner.test.ts src/modules/ai-runtime/video-decisions-runner.test.ts`
  - 113/113 PASS。
- `pnpm --filter @creatoros/ai-worker exec vitest run src/nodes/structured-node.test.ts src/prompt/templates/cover-brief.test.ts`
  - 21/21 PASS。
- `pnpm --filter @creatoros/backend typecheck && pnpm --filter @creatoros/ai-worker typecheck`
  - PASS。

尚未把“本地模拟/契约通过”冒充 Windows 上游真生成：用户机需要安装包含本提交的新 Windows 包，
再以官方权益做一次真实封面与视频生成，才能关闭真机验收。
