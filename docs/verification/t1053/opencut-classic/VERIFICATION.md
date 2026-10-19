# T-1053 原生视频候选验证记录

## 最终结果

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| 最终源码TypeScript | 退出码0 | `verification/evidence/verify-source-archive-final.log`（先执行tsc，再执行下列两批测试） |
| 归属/同轨采纳/冻结导出/寿命回归 | 13测试、68断言、0失败 | `verification/evidence/native-regression-final.log`；最终解包复跑见 `verify-source-archive-final.log` |
| 慢图片、迟到素材回执、等待绘制取消 | 独立进程3测试、12断言、0失败 | `verification/evidence/resource-cancellation-final.log`；最终解包复跑见 `verify-source-archive-final.log` |
| 原组件DOM与生命周期 | 38项检查通过 | `verification/evidence/dom-final-source.log`；最终解包复跑见 `dom-source-archive-final.log` |
| 标准补丁应用 | 64变更文件、dry-run/应用成功；704文件与完整源码逐SHA256一致 | `verification/evidence/patch-dry-run-final.log`、`patch-apply-final.log`、`patch-source-reconstruction.json` |
| 生产重建 | 连续构建及最终归档新目录重建，7个输出逐字节一致 | `verification/evidence/build-production-graph-repeat.log`、`build-source-archive-reconstruction-final.log`、`archive-production-reconstruction.json` |

测试总数为16项、80个expect断言，DOM检查另计38项。此计数只计最终测试集合，不叠加重复执行次数。实际生产bundle为原React组件/引擎的ESM，7,256,208字节；CSS为127,770字节。构建图包含426个实际保留的本地/虚拟模块，许可清单为59个依赖。

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
