# T-1274 中心候选与private源帧闭包

本轮第三named slot把宿主候选投影在中心，原预览core保持DOM与尺寸；候选active时全部原core和快捷键锁定，空/解绑/卸载解除投影。compact header恢复原EditableProjectName→renameProject入口与工程名。DOM夹具真实检查中心42项、改名25项和旧组件38项；不把夹具签为实际GPU/宿主视觉或保存backend PASS。

private SceneExporter cache仅按源PTS/declared duration半开区间取帧：等待pending prefetch、用实际next PTS晋升、保gap/取消/EOF。锁定MediaBunny文档确认poolSize0不复用画布；exact禁池保同素材多层不同源时刻，interactive保原3。真实旧源冷缓存3项RED→20PASS79断言；真resolveRenderTree并发1s/2s节点像素24变48的RED→1PASS7断言，后续迭代也保像素。WASM转换与解码端口为fixture，画布像素可读；不签实际MP4/GPU。

完整71测试341断言、类型、production build及final AST均通过。715源码（原713+preview-workspace+canvas测试）标准patch实际F0还原、归档与展开源字节相同；从归档再次正式build七份与双发布路径逐字节相同。所有新环境失败及旧RED保verification/t1274-preview-center；旧patch空白/CRLF噪声不洗绿。接续盘点另找到旧agent本轮同worktree原始中心slot/工程名称/全部core锁三份真实RED日志（red-dom/red-rename-dom/red-core-lock-dom），已原字节保留；本agent未重演，不冒充新执行。

最终新48帧候选的真实公共UI→预览→采纳→MP4仍待ROOT；先前重复前帧与AAC对齐FAIL保留，AAC/原900000ms预算未改，T1277另核。未新签独立视觉分或安装PASS。具体SHA/命令/限度见同目录verification-summary.json及DELIVERY.json。以下为历史记录。

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

# T-1274 当前验证

| 检查 | 当场结果 | verification/t1274内证据 |
|---|---|---|
| 新行为缺失 | 4例FAIL；旧DOM缺slot断言FAIL | tdd-red.log、dom-tdd-red.log |
| 新行为 | 4 PASS / 24断言 | tdd-green.log |
| 原命令/寿命/边界 | 19 PASS / 116断言 | native-regression.log |
| 原资源/取消/原声范围 | 16 PASS / 68断言 | resource-regression.log |
| 类型 | exit 0 | typecheck-final.log |
| 正式build/process全局 | exit 0；无unguarded process | build-production-final.log、process-globals.log |
| 原DOM回归 | 38项PASS | legacy-dom-regression.log |
| 工作区DOM | 22项PASS | dom-tdd-green.log |
| 上游patch与归档 | fuzz 0；707源文件字节一致 | patch-apply-final.log、source-reconstruction.json |
| 归档重建与两份正式路径 | 七份逐字节一致；fixture=false | rebuild-from-archive.log、production-reconstruction.json |

DOM夹具替换compositor/Canvas，不证明真实GPU、像素或MP4。未运行宿主集成、真实浏览器独立视觉评审/任务走查及安装。初次类型布尔差异、patch缺EOF换行标记、基线依赖链接失败均保留，未追签历史PASS。完整patch文本的diff空白噪声保留，不改原源码洗绿。

以下保留历史验证说明；不将历史PASS冒充本任务完整验收。

# T-1062 原生 TMP 实际验证记录

源码候选：`246e63a02753b7a90760611506a82341d8457462a996aed8463f7f91eccdc153`；成员31，归档 `3cd56aa533804be27842c007d8660dfb94d9b5a0c46011172faab41661a54fa6`。

本节仅记录本次实际命令。JSDOM/合成音频夹具不能作为真实浏览器、听感、ASR、安装通过。

- exit 0；`/tmp/t1062-native-build-preflight/build-tools-bun/node_modules/@oven/bun-darwin-aarch64/bin/bun apps/web/scripts/build-native.mjs`；日志 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/commands/opencut-classic-production-build-r6.log`；SHA `bbab7607cbc949b0031ac7ab60f543ff0e74159d5026ce38a1ad114e013cc6e8`。
- exit 0；`/tmp/t1062-native-build-preflight/build-tools-bun/node_modules/@oven/bun-darwin-aarch64/bin/bun test src/embedded/__tests__/native-lifecycle.test.ts src/embedded/__tests__/native-command.test.ts src/embedded/__tests__/host-boundary.test.ts`；日志 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/commands/opencut-classic-verify-native-tests-r6.log`；SHA `735231a2af5737f058fd90af75af5c180721d91252405819355f2c6ed72b43d3`。
- exit 0；`/tmp/t1062-native-build-preflight/build-tools-bun/node_modules/@oven/bun-darwin-aarch64/bin/bun test src/embedded/__tests__/native-resources.test.ts`；日志 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/commands/opencut-classic-verify-resource-tests-r6.log`；SHA `088a42438f6fe60f6839b202b960b5b6825920079fba4fa3f4c99e5e7b92eb3e`。
- exit 0；`/tmp/t1062-native-build-preflight/build-tools-bun/node_modules/@oven/bun-darwin-aarch64/bin/bun ../../node_modules/typescript/bin/tsc --noEmit --project tsconfig.embedded.json`；日志 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/commands/opencut-classic-verify-typecheck-r6.log`；SHA `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- exit 0；`/usr/bin/env CREATOROS_TEST_TYPESCRIPT_MODULE=/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/clones/opencut-classic/node_modules/typescript/lib/typescript.js /tmp/t1062-native-build-preflight/build-tools-bun/node_modules/@oven/bun-darwin-aarch64/bin/bun /var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/physical-providers/check-process-globals.ts /var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/clones/opencut-classic/apps/web/native-dist/native.js /var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/opencut-physical-process-ast-r6-result.json`；日志 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/commands/opencut-physical-process-ast-r6.log`；SHA `64ea2c865a72f96ec4de67af54fe718426ddab391c4c50e01819af441b51a70a`。
- exit 0；`/usr/bin/env CREATOROS_TEST_JSDOM_MODULE=/Users/zyongzhu/.codex/worktrees/t1062-frontend-native-delivery/Thirdspace-creator/frontend/node_modules/jsdom/lib/api.js CREATOROS_NATIVE_FIXTURE_MODULE=/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/clones/opencut-classic/apps/web/native-dom-fixture-dist/native.js /tmp/t1062-native-build-preflight/build-tools-bun/node_modules/@oven/bun-darwin-aarch64/bin/bun /var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/physical-providers/dom-probe-r6.ts`；日志 `/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-native-r4-build-_mj76bbr/commands/opencut-physical-dom-r6-jsdom29.log`；SHA `0471c486c86ed8acde2b6029785fec9ac3d499806511cdc69c4148988dce4daa`。

Kuaitu：core4/native35；Doocs lease4；OpenCut主回归18、resource14、DOM38。按editor各自对应，不合并重复执行计数。
全部历史失败保存在独立TMP，未覆盖。宿主18与安装/试听尚未执行。

---

下列内容是原T-1053历史记录，原字节以before SHA绑定；其中旧PASS不代表本次新源码的新执行。

# T-1053 原生视频候选验证记录

## 最终结果

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| 最终源码TypeScript | 退出码0 | `verification/evidence/verify-archive-production-final.log`（先执行tsc，再执行下列两批测试） |
| 归属/同轨采纳/冻结导出/寿命回归 | 13测试、68断言、0失败 | `verification/evidence/native-regression-final.log`；最终解包复跑见 `verify-source-archive-final.log` |
| 慢图片、迟到素材回执、等待绘制取消 | 独立进程3测试、12断言、0失败 | `verification/evidence/resource-cancellation-final.log`；最终解包复跑见 `verify-source-archive-final.log` |
| 原组件DOM与生命周期 | 38项检查通过 | `verification/evidence/dom-node-env-final.log`；最终解包复跑见 `dom-archive-production-final.log` |
| 标准补丁应用 | 64变更文件、dry-run/应用成功；704文件与完整源码逐SHA256一致 | `verification/evidence/patch-production-dry-run-final.log`、`patch-production-apply-final.log`、`patch-production-source-reconstruction.json` |
| 生产重建 | 连续构建及最终归档新目录重建，7个输出逐字节一致 | `verification/evidence/build-production-node-env-repeat.log`、`build-archive-production-final.log`、`archive-production-define-reconstruction.json` |

测试总数为16项、80个expect断言，DOM检查另计38项。此计数只计最终测试集合，不叠加重复执行次数。实际生产bundle为原React组件/引擎的ESM，6,605,600字节；CSS为127,770字节。构建图包含426个实际保留的本地/虚拟模块，许可清单为59个依赖。

## 浏览器Node全局边界

复核发现前一候选仍有14处未替换的React CJS `process.env.NODE_ENV`，浏览器没有process时会崩；原Bun环境DOM验证未覆盖这一差异。该缺陷的原产物哈希与实际14处上下文保留在 `verification/evidence/node-env-pre-fix.json`。

最终Vite Library构建显式设置 `mode:production` 与 `define:{process.env.NODE_ENV:production常量}`，没有给浏览器注入假的process对象。最终生产JS的AST扫描为NODE_ENV残留0、未守卫全局process引用0；6处可选Node引用都由typeof或同条件短路保护。其余8个process标识符是成员/方法名。证据见 `verification/evidence/process-globals-production-final.json`，交付脚本verify模式同时运行可重放的AST扫描。

原DOM探针现先移除process全局，再导入原生fixture ESM，原38项交互检查全部通过，结果明确报告 `processGlobalDuringProbe:false`。最终源码解包后也复跑同一检查。

## DOM检查使用的真实组件与fixture边界

挂载原素材区、预览、属性区、时间轴；通过原文字素材加号落到同一时间轴，原Undo/Redo改变工程；真实Select键盘打开、选择、方向键、Escape、恢复焦点；真实预览上下文菜单与复选项使用Enter更新，关闭后重开保留状态。外部点击后焦点保留，应用外壳未被aria-hidden/body inert/全页滚动锁影响。原Sonner通知出现在实例中，外部Alt+T不抢焦点，内部快捷键保持可访问。换owner后旧React/portal清空，旧请求拒绝，新owner拥有新工程，重复dispose不残留DOM。

主题比较只忽略原 `metadata.updatedAt` 和各 `scene.updatedAt`；未知editable字段的updatedAt从未被泛化忽略。

探针在JSDOM中执行，使用明确命名的compositor fixture，并模拟Canvas、OffscreenCanvas与RAF。资源取消测试使用慢Image/RAF fixture，视频解码端口显式拒绝调用。它们证明上述组件行为和已覆盖的取消分支，不证明GPU出图、真实音视频解码、MP4、真实拖拽坐标或系统剪贴板。没有执行浏览器自动化。

## 真实失败与修正

原生产bundle两次DOM尝试由于环境没有WebGPU失败，`dom-first.log` 与 `dom-second.log`保持原样。后续fixture交互、焦点与通知构建过程中发生的失败日志也全部保留；最后成功不覆盖历史失败。最终源码导入时仍会报告WebGPU适配器缺失，即使fixture DOM断言通过。

初版打包补丁遗漏末行换行标记；第一次修正又误把原CRLF归一化，均由标准patch dry-run暴露。最终打包保留原字节换行和标准末行标记；对应失败保存在 `patch-first-failure.log` 和 `patch-line-ending-failure.log`。新目录构建首次发现虚拟commonjsHelpers路径随cwd变化，构建脚本现固定该虚拟模块名；运行JS/CSS一直一致，最终7个文件全部一致，首次差异见 `archive-production-virtual-path-first.json`。

TDD红证据仅沿用当场发生的生命周期缺模块红测（`lifecycle-red.log`）及之后绿测（`lifecycle-green.log`）。后续补测不冒充历史红测。

## 生命周期实现及保留限制

代码取消旧owner信号与编辑epoch，等待请求队列、素材导入、图片/音频元数据、MediaBunny Input及视频sink等未完成工作达到不可写状态。原核心销毁停止播放/保存/RAF，关闭AudioContext、断开节点、撤销URL、释放视频帧/缓存/纹理，取消图片加载并清空图像源、清理store/事件/observer/订阅/通知/门户，再交接lease。原核心重载使用generation remount让useEditor读取新实例。

原 `opencut-wasm` 0.2.10的公共API没有GPU设备/compositor销毁方法。实现释放所有当前纹理并缩小/移除canvas，但其模块GPU初始化对象仍保留到浏览器文档关闭。此项真实限制未被fixture证明消失，也未声明彻底free GPU设备。

以下仍待主会话验收：实际宿主加载、真实浏览器WebGPU、真实媒体预览与MP4、系统剪贴板、各尺寸人工视觉检查和根任务/frontend/contract/e2e/boundary/orphan/reconcile Gate。对应源码归档重建本轮连接已有冻结锁依赖树，没有fresh安装或跨OS可复现证据。

## T-1069 当前源码与生成物

本轮实际运行原生类型检查、生产构建、19 项控制测试、16 项资源测试与 42 项 DOM 检查。完整上游补丁及旧原生归档增量均 `patch --fuzz=0` 还原为当前 705 文件，逐文件字节相等。证据：`/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/t1069-native-source/delivery-candidate` 与 `/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/t1069-tests`。以上不代表浏览器像素、视频性能、MP4 或安装验收；旧记录保持历史含义。
