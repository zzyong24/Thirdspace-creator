# GATE-T654-BUILD — Qwen 方言 ASR 适配器

> 日期：2026-08-02  
> 复用契约：既有 `transcribe.audio`、多模态 provider registry 与设置模型卡

## 结论

BUILD PASS。CreatorOS 新增真实 `qwen-asr` provider，设置页可一键选择
`qwen3-asr-flash`，用户填写百炼 API Key 后即可沿用现有逐字稿任务、落库和失败恢复链；
未配置云端 ASR 时仍回退本地 Whisper。

## 已验证

- 百炼 OpenAI 兼容接口使用 `chat/completions + input_audio data URL + asr_options`，鉴权、
  错误正文截断和空结果均有明确处理。
- 按 Qwen3-ASR-Flash 的 5 分钟 / 10MB 同步限制，将 CreatorOS 固定 64kbps MP3 按安全帧
  边界分段并顺序合并，不做破坏音频的原始字节截断。
- CreatorOS 既有默认 `zh` 不强制下发给 Qwen，以保留普通话、四川话、闽南语、吴语和
  粤语的自动识别；调用方显式指定 `yue` 等非默认语言时仍会透传。
- 用户本地配置、Growth 渠道逐能力配置和生产运行时 registry 均识别 `qwen-asr`；渠道只
  配其他模型时不会误接管 ASR。
- 设置页真实浏览器验证：选择 Qwen 后自动带出 provider、模型和百炼接口，填写 Key 后保存
  按钮可用。

## Gate 证据

1. TDD 红测：新增适配器前 worker 因模块不存在失败；设置页因 Qwen 预设不存在失败。
2. AI Worker：Qwen + MiMo ASR 共 7 tests PASS；`tsc --noEmit` PASS。
3. Backend：渠道 parser + 多模态 resolver 共 28 tests PASS；`tsc --noEmit` PASS。
4. Frontend：设置交互 40 tests PASS；`tsc --noEmit` PASS。
5. Playwright（真实 Chrome、隔离 PGlite）：Qwen 设置流程 1 test PASS。
6. boundary-scan：无新增违规；orphan-scan：0 error（保留仓库既有 BUILD 阶段 warning）；
   `git diff --check` PASS。

## 未冒充的证据

- 本次未使用用户真实百炼 Key 发起计费调用；请求协议由官方文档核对并由契约测试覆盖，真实
  账号额度、地域与网络连通性留给用户配置 Key 后的连接测试/首次转写验证。
- 本任务只增加适配器与设置入口，不构建安装包，也不宣称已正式发布。
