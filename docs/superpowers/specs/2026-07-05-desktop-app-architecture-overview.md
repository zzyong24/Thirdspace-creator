# CreatorOS 桌面化 + 资产保护架构总纲(T-147)

> 架构总纲(overview),非单一可执行 SPEC。方向:**加密桌面双端软件(Win/Mac)+ 轻服务端(更新 + Prompt 下发 + 防盗版)**。
> 用户裁决(2026-07-05):**中转站/TOKEN 充值暂不做**;要我作为架构师出方案 + 拆 Task,结合成熟商业 AI 桌面项目。
> 本总纲把大方向**分解成 6 个独立子项目(P1–P6)**,每个后续单独 brainstorming→SPEC→gate→Task。参考 `docs/PROTECTION.md`(立场基本认同,去中转后变形)。

## §0 核心判断(架构师视角)

**桌面化本身工程量小,真正的战场是资产保护。** 勘查坐实:CreatorOS 架构已是「本地优先、进程内、零 docker 可跑」——`dispatch` 纯进程内库调(无外部 HTTP)、`resolveDbDriver` 已支持 PGlite 落盘 `~/.creatoros/db`、T-046 单机免登录。套个 Tauri 壳 + `output:standalone` 就能跑起来。

**所以方案重心不是「怎么打包」,而是「打包后核心资产(prompt / key / 逻辑)怎么不泄漏」。** 两个真障碍:
- 🔴 **Prompt 全文双重泄漏**:21 个模板打进 ai-worker 包 + **设置页「技能」页签主动把内置 prompt 序列化下发到浏览器**(`skills-section.tsx`,产品有意让用户查看/定制)。桌面化后 = prompt 资产直接交给终端用户。
- 🔴 **API key 明文**:`model_configurations.secret_value` 明文 DB 列,落盘 PGlite 文件无加密。

PROTECTION.md 的立场我基本认同(IP 留服务端 / Tauri / AI 保护优先 / 不过度防逆向 / 不做传统 license),但它**通篇依赖中转站**(LiteLLM 中转 + TOKEN 计费 + manifest);去中转后要变形。

## §1 目标形态

| 层 | 职责 | 关键技术 | 现状 |
|---|---|---|---|
| **客户端**(Tauri v2 壳) | UI(现有 Next.js/React)+ 本地离线数据(PGlite 落盘)+ 编排(进程内 backend/ai-worker 库调) | Tauri v2 · Rust · next standalone | 零打包,全新 |
| **服务端**(轻,**零用户数据**) | ①自动更新(Tauri updater + 签名)②Prompt 远程下发(核心 prompt 不落客户端明文)③manifest 周期回连(Ed25519 签名 + 离线宽限,软防盗版) | 静态签名分发(R2/CDN 即可,无 DB) | 全新 |
| **AI 调用** | 中转暂不做 → 用户自配 key,但 key **本地 OS keychain 加密存**(不再明文 DB) | Tauri Stronghold / macOS Keychain / Win DPAPI | key 现明文,待加密 |

## §2 去中转后的架构调整

PROTECTION.md 的中转站承担了三件事,去掉后各自安置:
- **API key 归集(一个 TOKEN)** → 暂不做;用户自配各家 key(回到 model-config),重心转为**本地加密存储**。
- **计费/用量** → 无(用户自付各家)。
- **manifest 下发通道** → 保留,但简化成**静态签名分发**(不需要中转代理,一个 CDN + 签名文件即可)。

## §3 分解:6 个独立子项目(每个单独 SPEC→Task)

| 子项目 | 目标 | 关键技术/复用 | ROI | 依赖 |
|---|---|---|---|---|
| **P1 Tauri 打包底座** | Tauri v2 集成 + `output:standalone` + 进程内 backend/ai-worker + DB 默认 PGlite 落盘 + Win/Mac 构建 + 代码签名/公证 + 自动更新 + **原型验证**(存疑项) | Tauri v2;`resolveDbDriver` 已支持落盘(复用) | 高(地基) | 无 |
| **P2 本地加密** | key 明文列 → OS keychain;PGlite 落盘目录加密;CSP + Tauri capability deny-all | Stronghold/Keychain/DPAPI | 高 | P1 |
| **P3 Prompt 服务端化** | 核心 prompt 不落客户端明文,服务端签名下发→客户端热更;**复用 T-040 override 引擎**(只改 override 源:本地表→服务端拉取) | `skill_config_overrides` + `reapplySkillOverrides` 热更(复用) | 高(核心资产) | P5 + 产品决策 |
| **P4 AI 推理保护 5 件套** | ①`<user_data>` 包裹(=T-134)②retriever rail(RAG 注入过滤)③tool whitelist(AI 不调写库)④sensitive class 分级⑤(输出水印,不做) | 独立于桌面化,纯后端加固 | **最高**(ROI 之本,现在就能做) | 无 |
| **P5 授权/防盗版 + 更新分发** | **复用已部署的 activation-manager**(`license.aitongban.cloud` 一机一码 TIME/COUNT + 后台管理/吊销/统计 + 现成 `license-sdk.ts`)接入 CreatorOS(建 `projectKey`);**Ed25519 加固**其响应未签名弱点(授权结果签名 + 客户端内置公钥验签 + 解密密钥绑激活)+ **离线宽限**(本地缓存签名凭证);更新包分发 R2/CDN | activation-manager(已上线,复用)+ T-045 的 Ed25519 思路 | 中 | P1 |
| **P6 防逆向加固** | 适度 JS/Rust 混淆(挡一键 patch)+ runtime 自检 | javascript-obfuscator + Tauri 自检 | 低(只挡业余) | P1 |

## §4 依赖 + 推荐启动路径

```
P4(AI 保护,独立,最高 ROI)  ──── 现在就能做,不等桌面化
P1(Tauri 底座 + 原型验证)  ──┬── P2(本地加密)
                            ├── P5(服务端) ── P3(Prompt 服务端化)
                            └── P6(防逆向,最后)
```

**推荐起步(并行两条)**:
1. **P4 AI 推理保护**——ROI 最高、独立、现在就能做(且 `<user_data>` 是已在队列的 T-134)。**立即价值**,不依赖桌面化任何东西。
2. **P1 原型验证**——先验证存疑项(`next standalone` + PGlite WASM 能否打进 Tauri、71 作品级 PGlite 落盘性能),**用小原型证明可行再投入正式迁移**(避免押错技术栈)。

P2/P3/P5/P6 在 P1 底座 + P5 服务端就位后展开。

## §5 关键决策(待用户拍板 —— 影响 P3/起步)

- **D1 [决定 P3] Prompt 功能取舍**:桌面端**还要不要「用户可查看/定制 prompt」**这个现有功能?
  - 若**保护 prompt 资产** → 核心 prompt 留服务端、客户端只下发结果,设置页「技能」页签下线或只暴露「可定制的壳(参数)」而非全文。与现有 T-040「本地可编辑 prompt」设计正面冲突,需重划边界。
  - 若**保留用户定制** → prompt 注定暴露,P3 降级为「只做远程更新/迭代,不做防泄漏」。
  - **这是产品哲学决策**(资产保护 vs 用户自主),只有你能定。
- **D2 起步优先级**:P4(AI 安全,立即价值)先行?还是 P1 原型(桌面可行性)先验?还是都并行?
- **D3 打包技术**:Tauri(推荐:体积小/Rust 原生加密/CSP)vs Electron(生态大/Next 集成成熟但体积大/防护弱)。我倾向 Tauri,但 Next.js 塞 Tauri 有集成成本,需原型确认。

## §6 存疑/风险(P1 原型必须先验)

- `next build` standalone + PGlite WASM 在 Tauri/Electron 打包路径下能否正确 require(WASM asset 路径)——**未验,押技术栈前必验**。
- 纯 PGlite 落盘(无 DATABASE_URL)在 71 作品级数据的性能/并发(单进程独占落盘限制)——未验。
- Prompt 保护 vs 用户定制的产品张力(D1)。
- 防逆向对「认真攻击者」无效(PROTECTION.md 已认,ROI 之外不投)。

## §7 与现有任务/资产的关系

- **T-134**(`<user_data>` 包裹)= **P4 的第①件**,已在 BACKLOG,可直接归入 P4。
- **T-040**(skill_config_overrides + 热更)= **P3 的现成引擎**,只差 override 源改服务端。
- **activation-manager**(已部署在线激活系统,`license.aitongban.cloud`,一机一码 + 后台 + `license-sdk.ts`)= **P5 的授权引擎**,直接接入(建 projectKey + 客户端调 activate/status/consume)。
- **T-045**(`2026-07-02-activation-single-user-design`,⏸️ 用户暂缓,离线 Ed25519 验签方案)= **P5 的加固思路来源**(补 activation-manager 响应未签名弱点);短期去登录已由 **T-046** 落地(无 session 直通本机主用户)。恢复时不是重启 T-045 全案,而是取其 Ed25519 签名 + 离线宽限思路叠加到 activation-manager 之上。
- **T-136/T-146**(多账号 / 素材主权)= 内容功能,与桌面化**正交**,继续推进不受影响。
- **`docs/DEPLOYMENT.md`** 已是「单机分发」方向,与桌面化重合,P1 落地后更新为「一键 .exe/.dmg」。

## §8 下一步

本总纲过用户确认(尤其 D1-D3)后:每个启动的子项目单独走 brainstorming→SPEC→gate→拆 Task。**不一次性铺开 6 个**(那是灾难),按 D2 定的优先级逐个立项。
