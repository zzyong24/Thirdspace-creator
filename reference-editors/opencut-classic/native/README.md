# T-1274 响应式工作区与素材槽位

2026-10-14：按编辑器实际容器宽度布局：小于700px单面板，四个按钮依次为素材/转录、画面、时间轴、编导/属性；700–1099px画面和时间轴保持，按需展示一侧340px面板；1100px及以上沿原可调三栏。单面板时间轴保原控件和水平滚动，不缩成不可读竖列。所有Core、Resizable、portal和宿主草稿保持同一实例。

素材面板顶部新增creatoros-materials槽位，data-creatoros-addon沿原键盘归属。候选active出现记录原面板并转画面，移除后恢复原面板；宿主下一动画帧恢复原触发按钮焦点。未改正式工程owner、数据合同、控制器或private exact cache源码。

类型、原71测试341断言、完整AST、正式构建和58项DOM夹具通过；715源码标准patch以F0复原、归档再构建七份产物与双目录逐字节一致。冻结安装989包且锁文件未改。夹具ResizeObserver环境失败原日志保留。未执行本子候选真实宿主视觉/GPU/MP4/安装；由ROOT继续真实UI和独立任务走查，不把DOM夹具签为像素或完整验收。

证据见verification/t1274-responsive/verification-summary.json。下面的旧证据原样保留。

本轮T-1274中心投影、原工程改名与private exact export源帧已归档。执行rebuild-native.sh verify包含新canvas多节点回归；DOM为显式fixture，最终真实GPU/MP4/UI采纳待ROOT。完整证据见VERIFICATION.md与verification/t1274-preview-center。

# T-1274 已分离原声预览兼容窄修

原OpenCut音频分离使用video的真实mediaId创建upload音轨，原backend合同允许audio元素引用video媒体。本轮仅修preview-scene的机械媒体类型校验，audio允许audio/video，video/image保持strict。未改变候选scope、renderer ABI、播放、保存、采纳或AAC时长。

真实公共controller RED：18通过/1失败（原video加已分离原声音轨）；窄修后19通过，3项不兼容媒体族继续拒绝。完整原回归66测试323断言、类型、正式build、AST通过；713份source标准patch实际F0还原与归档字节一致，归档再productionbuild七份与双目录一致。证据在verification/t1274-preview-separated-audio，旧失败和主会话原E2E时长失败均不覆盖。

本轮未重复DOM，先前38+22项证据原样保留；未签本子候选真实GPU/MP4/E2E PASS，未放宽主会话时长断言。标准patch上下文空白/原CRLF的diff-check告警保留，非patch检查PASS。以下为历史候选交付说明。

# T-1274 候选隔离预览交付

补齐生产`preview-scene`公共命令，使用原`renderer.exportProject` frozen ABI。校验完整owner、当前epoch、完整tracks前值与scene候选摘要、真实File与精确媒体版本；克隆当前工程，仅候选目标scene轨道替换。预览不暂停活动播放，不保存/切场景/写command，不改dirty、撤销、selection或contextEpoch。回执前再次核对，取消继承原signal/寿命，不重发或续期。

```mermaid
flowchart LR
 A[当前工程与真实媒体] --> B[owner / epoch / before摘要]
 B --> C[独立候选scene / 完整candidate摘要]
 C --> D[真实renderer / 独立画布与解码缓存]
 D --> E[真实MediaBunny编码 / 取消释放]
 E --> F[再次核对 / 可播放候选Blob]
```

真实CanvasRenderer在同一同步段执行WASM renderFrame与帧拷贝，各实例输出尺寸沿原项目；编码不读活动预览输出。SceneExporter取消/失败释放源、未finalize输出、独立解码缓存和画布；临时音频context、慢图和贴纸随原取消释放，活动缓存保持原作用域。旧export frozen ABI与原公共命令保留。

实RED与全部失败保留`verification/t1274-preview`；当前62测试及机械端口夹具通过，旧DOM38项与workspace22项通过。713份source归档与相对真实上游source.tar.gz的标准patch实际F0还原字节一致；从归档再次正式构建所得七份与两处生产目录一致。完整源码审查目录`/tmp/creatoros-t1274-preview-isolated`仍保留。

**以上不证明真实GPU像素、实际MP4/AAC、宿主候选交互或安装包通过。**真实公共媒体与E2E由主会话继续验证；DOM fixture产物没有发布。当前SHA和实证以DELIVERY.json、SHA256SUMS及verification/t1274-preview为准。全量git diff --check保留标准patch上下文空白/原CRLF告警（exit2）；非patch检查PASS。补丁真实F0复原和源字节一致，未为消告警重写历史源。以下为历史交付说明，原失败不覆盖。

# T-1274 原生统一剪辑工作区候选

此候选沿已确认的CreatorOS品牌，保留OpenCut素材、属性、预览和时间轴实例。`workspaceAddons: true` 时，左侧素材/转录、右侧编导/属性使用页签与named slot；默认素材/编导。有真实原片时由宿主调用open-addon打开转录；重复标题仅在此模式隐藏。

`request('open-addon', {panel: 'assets'|'transcript'|'director'|'properties'})` 返回 `{panel}`；页签不改正式JSON、dirty或contextEpoch。宿主light DOM元素必须有 `slot="creatoros-transcript"` 或 `slot="creatoros-director"`，并有 `data-creatoros-addon`。宿主保持唯一portal target，销毁原生前同步回迁聊天DOM。

`disabled` 只锁原生core与原生弹层；宿主slot、页签、诊断保持可用。`visible: false` 暂停播放并使整面inert。addon键盘/粘贴不属于原生命令。未传workspaceAddons保留旧布局与禁用语义。

七份正式构建文件直接放在本目录，与frontend/public/reference-editors/opencut-classic/native逐字节一致。完整源码707文件；native-from-t1046.patch是对真实上游source.tar.gz的完整标准补丁，实际patch -p1 -F0所得源与归档逐字节一致；旧T1069补丁另存native-from-t1069.historical.patch。

已验证新增4例RED→GREEN、原19例命令/寿命和16例资源回归、类型及生产AST；真实React/slot DOM夹具22项与旧DOM38项；归档重建七份生产输出字节一致。原失败保留verification/t1274。**未验证真实浏览器视觉、GPU像素、AAC/MP4、宿主聊天集成或安装包。**

下文为历史交付说明，当前数据以DELIVERY.json的T1274字段和verification/t1274为准。

# T-1062 当前原生候选

当前source与输出以本次candidate及校验清单为准，真实原命令记录见 VERIFY.md/VERIFICATION.md。宿主18、浏览器视觉、试听与安装尚未执行。

## 原T-1053说明（历史保留）

# T-1053 OpenCut 原生候选交付

本目录交给主会话串行集成。未写共享 checkout、任务状态、根 manifest，也未提交共享 WIP。

```mermaid
flowchart LR
 A[CreatorOS 当前视频稿] --> B[同文档 owner lease]
 B --> C[ShadowRoot 内原 OpenCut 四区组件]
 C --> D[原命令 / 撤销 / 同轨采纳 / 原导出]
 D --> E[宿主正式保存与真实素材回执]
```

## 目录

| 路径 | 内容 |
| --- | --- |
| `native/` | 生产 ESM `native.js`、`native.css`、固定预览图、59项依赖许可与426模块构建图，共7个文件 |
| `native-source.tar.gz` | 704文件对应源码，含锁文件、构建入口与测试，排除依赖、环境秘密与构建输出 |
| `native-from-t1046.patch` | 在冻结 T1046 `source.tar.gz` 上应用的64文件标准补丁 |
| `rebuild-native.sh` | 安装、构建、验证（含process全局AST扫描）与明确命名的DOM fixture模式 |
| `corresponding-source/` | 沿用的 MediaBunny、SoundTouchJS 对应源码与排除记录 |
| `verification/` | JSDOM探针与所有原始成功/失败证据 |
| `VERIFICATION.md` | 验证范围、计数与未验证项 |
| `SHA256SUMS` / `DELIVERY.json` | 逐文件哈希与机器可读交付信息 |

来源为 OpenCut classic `cf5e79e919144200294fb9fed22a222592a0aeea`，基于已集成 T1046 的固定源码继续修改。基线归档SHA256为 `ad5a2b874a2b50ab10fca522a271b5c929f383af5c9e40bdf1c3f4feb45360a6`。

## 宿主接口

先将 `native.css` 装入宿主 ShadowRoot，再提供同一工作面的 `container` 与 `portalContainer`（高度由宿主分配）。从 `native.js` 导入命名导出 `mount`：

```ts
const handle = await mount(container, {
  owner: { accountId, outputId, sourceVersionId },
  theme: { mode, tokens, fontFamily, fontSize, density },
  portalContainer, signal, onChanged, onError, importMedia,
});
await handle.request(operation, payload, { requestId, signal });
handle.update({ theme, disabled });
await handle.dispose();
```

`importMedia(File)` 由宿主完成真实素材保存并返回 `{mediaId}`。操作与结果保持 `load/snapshot/insert-media/export/context/seek/apply-tracks` 的已有形状；工程保持v31原生文档，seek/context保持120000 ticks/s。apply-tracks继续完整原轨前值与摘要校验、409冲突、单次真实命令、挂载寿命内不可淘汰的采纳回执及不重复ripple；导出继续原MediaBunny/WebCodecs和同次冻结文档。

原React四区、Select与菜单组件保持可操作。主题、Radix门户/无障碍隐藏/焦点/滚动、通知样式/快捷键仅属于当前工作面。换owner等待旧异步操作到达不可写状态并完成清理，再通过generation真正重挂原组件。

## 重建

实际工具链为 Bun1.4.0、Vite6.4.3、TypeScript6.0.2。Vite Library构建显式使用production mode和production的NODE_ENV常量，产物不依赖浏览器不存在的Node process。目录名由集成人选择：

```bash
mkdir native-source
tar -xzf native-source.tar.gz -C native-source
./rebuild-native.sh native-source install
./rebuild-native.sh native-source build
./rebuild-native.sh native-source verify
```

生产结果位于 `native-source/apps/web/native-dist`。`install`使用原锁文件、关闭包安装脚本；本轮实际重建复用了已有锁依赖树，未重新运行fresh依赖安装，未宣称跨OS位复现。

补丁入口：先解包上述精确冻结T1046归档到新目录，再在该目录运行 `patch -p1 < /绝对路径/native-from-t1046.patch`。最终完整源码和应用补丁的704个文件逐文件SHA256一致；从新目录源码重建的7个生产文件与本目录完全一致。

DOM探针必须显式指定已有JSDOM api.js路径：

```bash
CREATOROS_TEST_JSDOM_MODULE=/绝对路径/jsdom/lib/api.js ./rebuild-native.sh native-source fixture
```

该模式输出到独立 `native-dom-fixture-dist`；探针在导入原生模块前移除process全局，替换compositor并模拟Canvas/OffscreenCanvas，不可发布；不证明真实像素、GPU或MP4。没有执行浏览器自动化。

## 许可与限制

OpenCut是MIT；生产bundle各项依赖许可原文见 `native/THIRD_PARTY_LICENSES.json` 与 `.txt`，不能将整个bundle统一标为MIT。MediaBunny1.41.0为MPL-2.0，SoundTouchJS0.3.0为LGPL-2.1，两库未修改且对应源码已随包交付。固定效果预览图保留上游来源；未下载Google字体二进制。

原opencut-wasm0.2.10提供纹理释放和compositor缩放，没有GPU device/compositor销毁API。当前dispose释放现有纹理、缩小并移除canvas，停止/关闭音频、媒体解码器、导入、RAF、保存、监听、订阅与原React组件；WASM模块初始化的GPU设备对象保留至浏览器文档关闭，不能声称彻底释放设备。

真实浏览器/WebGPU预览、真实媒体像素、MP4与系统剪贴板尚未验证。主会话继续执行宿主集成与任务Gate；本目录仅报告已经发生的候选证据。
