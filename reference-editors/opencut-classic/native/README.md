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
