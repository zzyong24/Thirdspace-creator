# T-943 JY_IPAgent 运行与数字人接入调研

用户要求将 https://github.com/zzyong24/JY_IPAgent.git 拉到相邻工作目录，先跑通项目，核实数字人调用 API 还是本地模型，并调研接入 CreatorOS 的可行性，偏好 API。

本轮范围：克隆至 /Users/zyongzhu/Workbase/JY_IPAgent；检查启动方式、依赖、供应商、接口与许可证；运行可用链路，记录真实证据与所缺凭据；形成接入建议。本轮不直接改变 CreatorOS 产品架构或业务契约，实施接入需后续明确契约与评审。

```mermaid
flowchart LR
 A[拉取独立工程] --> B[启动并检查数字人链路]
 B --> C[核实 API 与模型依赖]
 C --> D[提出 CreatorOS 接入方案]
```

验收：仓库路径和提交可追溯、启动健康检查、数字人真实调用结果或具体阻塞原因、附源码路径的调研结论。禁止用页面可打开代替数字人成片跑通。

## 实测结果（2026-09-09）

已克隆至 `/Users/zyongzhu/Workbase/JY_IPAgent`，提交 `fdf4311784e894515cbf178c8ff689436497ab92`，版本 0.1.40。使用独立 `.venv`（Python 3.12）安装 `requirements-desktop-core.txt`，`npm ci --ignore-scripts` 与 `npm run build` 成功。启动命令：

```bash
cd /Users/zyongzhu/Workbase/JY_IPAgent
AGENT_PORT=7868 .venv/bin/python server.py
```

本轮服务 PID 3187，地址 http://127.0.0.1:7868。健康接口返回 `ok=true, ui=true`；已在浏览器打开并点击数字人口播页面。应用自动建立独立空会话。数字人库为空；未生成数字人视频。

证据：`/Users/zyongzhu/Workbase/JY_IPAgent/output/t943-verification/runtime.json`。HeyGem 状态接口返回 `ready=false, cuda_available=false, can_start=false`，提示缺 NVIDIA GPU；本机为 macOS arm64。云端 provider 真实函数调用返回 `NotImplementedError: 云端数字人尚未接入`，此探针未上传素材、未调用付费接口。用户明确回复：目前没有数字人云 API 或 GPU 服务器。

## 数字人到底怎么运行

| 能力 | 实际实现 | 是否现成云 API |
| --- | --- | --- |
| 视频形象口播 | HeyGem/Duix，本地 HTTP 8383 + NVIDIA 模型服务 | 否，是自托管模型的 HTTP 接口 |
| 静图口播 | SadTalker，本地 Python 模型 | 否 |
| 实拍换嘴 | LatentSync，本地模型推理 | 否 |
| 云端数字人 | 配置中预留 volcengine/heygem_cloud | 未实现，函数直接报错 |
| 云端配音 | Qwen3-TTS 有独立实现 | 配音不等于数字人成片 |

源码依据（均相对于参考仓库）：`workflow/providers/avatar.py:42`、`avatar/heygem.py`、`workflow/engine_catalog.py`、`config.example.yaml`、`pipeline.py`、`api/routes/avatar.py`。

HeyGem 的 `/easy/submit` 接收音频/视频路径，`/easy/query?code=...` 查询任务。客户端先复制素材到共享挂载目录，结果也从挂载目录取回。因此不能只把 `video_api` 改成远程地址就完成跨机器接入：还需要上传、远程素材暂存、结果下载、认证和任务持久化。`audio_url` 字段名也不代表已支持公网文件 URL。当前 health_check 把 HTTPError 也视作服务存活，接入时必须校验真实协议响应，不能沿用为生成能力验收。

## CreatorOS 接入建议（设计建议，尚未实施）

技术上可以接入；按用户偏好，优先独立实现供应商云 API 适配器。保留 CreatorOS 已有 production 服务、素材归属与 execution_tasks 作为任务真相，不复制 JY 的会话目录和第二套任务队列。

```mermaid
flowchart LR
 A[已确认稿件与配音] --> B[CreatorOS 后端创建任务]
 B --> C[Worker 上传授权形象与音频]
 C --> D[数字人云 API]
 D --> E[查询原任务并下载成片]
 E --> F[后端登记项目素材]
 F --> G[现有制作页预览与剪辑]
```

输入契约需覆盖账号/项目、授权形象资产、音频资产、供应商及幂等键；输出需覆盖供应商任务 ID、状态、结果视频及诊断。Worker 负责外部调用和恢复，backend service 负责归属校验和落库；超时保留原供应商任务，不盲目重复付费提交。后续衔接现有 T-851 数字人口播需求，避免重复建设。

若追求与该项目相同的 HeyGem 效果，备选是部署独立 NVIDIA GPU 服务并封装文件传输接口。用户目前没有该资源，本轮不租服务器或采购服务。

可进一步验证的供应商方向：火山官方提供单图音频驱动和视频形象驱动文档。单图驱动与本人视频克隆不是同一需求，需按 T-851 的本人参考视频目标选择支持的视频克隆产品。文档索引已检索到，正文抓取失败；尚未验证账号开通条件、价格、时长限制和实际成片质量，因此不作承诺。

- 单图音频驱动：https://www.volcengine.com/docs/85128/1433891
- 视频形象驱动：https://www.volcengine.com/docs/85128/1770764
- Duix 官方硬件与部署说明：https://github.com/duixcom/Duix-Avatar

## 复用边界与下一步

参考仓库 LICENSE 为 PolyForm Noncommercial 1.0.0，不能当作已获商业使用授权。CreatorOS 商用直接复用须取得适当授权；独立对接有商业服务协议的供应商 API 是更合适的候选方向。许可证原文：https://github.com/zzyong24/JY_IPAgent/blob/main/LICENSE。

应用启动和调研已完成；真实数字人成片未跑通，T-943 保留受阻状态。恢复条件：选定并开通支持目标形象模式的云服务、配置本机凭据、提供本人授权的参考素材，随后完成独立短片调用验证，再评审正式接入契约。无需用户在聊天中暴露密钥。
