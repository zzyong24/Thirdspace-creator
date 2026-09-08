# T-931 素材检索规划与本地交付

2026-09-08，用户明确要求搜索前结合主题通过 Skill 推断查询；沿用暂缓业务测试与付费模型验证的授权。

## 已交付

- `772dd159`：新增可配置 `research.plan`，中文“素材检索规划”，接入现有 Skill 管理和新任务冻结快照；以意图、主题、已有正文规划证据与少量短查询，再判断相关性、读正文、重规划。旧冻结任务缺新增 Skill 不借当前配置补入；素材入口不抢先强制搜索。
- `99bc2760`：显式查询不再追加上下文词污染；worker.research 修订 v2；UI 将未核实搜索结果称为线索。
- `f74cc9110e9fb9fa80204b48e21eb30fcb3c87b7`：应用自动检索百度 → DuckDuckGo，单适配器默认 DDG；修复查询传输校验、结果串卡与跳转 URL 解码；显式配置 Bing 保留。

## 真实证据

公开 CLI 读取任务 `ai-task-4fff7100-063c-44e6-be80-4ab39b3f6683`、会话 `ai-conv-3302704d-525`，证明实际由 Pi 执行，两个工具查询是大量词拼接，未读正文。无业务写入。

相同完整查询在本机 Bing 原始响应中得到随机无关主题，URL、输入框和标题仍回显完整查询；无法区分源站、网络或反爬根因，不宣称全网 Bing 故障。替代源实际入口 `微信支付 商户号 驳回原因` 经百度约 6.3 秒返回 5 条，含微信支付合作伙伴文档、企业微信帮助中心和微信开放社区；单 DDG 返回相关第三方线索。Stripe 限站查询百度遇验证页后实际切 DDG、后者为空；空结果须由模型继续规划，不代表无公开资料。

frontend typecheck、ai-worker build、diff --check 通过；CodeGraph 强制重建 exit 0；方法快照装配无 IO 探针通过；独立源码审查通过。新增协议与解析测试未执行，未运行付费模型，不将接线核验或搜索标题当成端到端素材质量验证。

## 本地安装包

从干净独立目录 `/private/tmp/creatoros-t918-package` 的候选 `f74cc9110e9fb9fa80204b48e21eb30fcb3c87b7` 运行固定 `pnpm -C frontend desktop:package-local`，exit 0。四处版本均 1.1.0，构建期间无源码修改；未运行单独的四项打包 vitest（沿用用户暂缓测试授权）。

- 产物：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- SHA-256：`3762b4d1f9e1f0c5b038e4db4ac2ee7e8e2e9df47879b6f09f0ffd87e37a0666`
- `hdiutil verify` VALID；安装 app 的 `codesign --verify --deep --strict` exit 0。
- 安装与候选 sidecar SHA-256 均 `657b0d42f34bd28f57b038bd8c06504c4bbb80c11bbda4e5795b0e8f1af7d8ca`。
- 固定构建的真实 sidecar 启动：ready、GET / 200、browser hydration PASS；最终 tar 回放签名校验通过。
- 已替换并启动 `/Applications/CreatorOS.app`，进程 PID 83356 实存。重启后 CLI 按设计失效，未绕过授权读取新实例业务数据，因此不宣称已在安装后跑完真实模型会话。
- 本地 ad-hoc 包，未 Apple 公证；未推送、tag、GitHub Release、Windows 包或公开分发。

日志：`/tmp/t931-package.log`、`/tmp/t931-dmg-verify.log`、`/tmp/t931-final2-typecheck.log`、`/tmp/t931-final2-worker.log`、`/tmp/t931-fallback-live.log`。

## 保留边界

`pmem sync` exit 0；全局 reconcile 按用户既有授权暂缓，T-916 已记录过程漂移与 T-923 write_set 通配路径问题，本次不洗成全绿。实际模型是否持续合理查询、阅读全文并给出可用素材，交由用户在新版重新发起请求验证。
