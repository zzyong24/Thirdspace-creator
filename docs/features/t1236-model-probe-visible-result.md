# T1236 核对模型保存并测试成功后界面结果丢失

用户要求全功能操作验证与明显问题及时修复。3921 设置七例实际5 PASS/2 FAIL、exit1、retry0；默认模型用例真实 UI 保存和正式流式探针响应已通过，固定本地SSE请求恰1次、非空正文、同模型成功，最终却在 model-test-result 元素上等待120000毫秒自然FAIL，元素不存在。不能称模型连接失败或以删UI结果断言洗绿。

原 `settings.spec.ts` SHA `4283e507e25ad9270a6f7fcb41ae2bca7e64d209ba45838a40efc12909648e13` 不改。原 evidence 位于 `docs/verification/t1232/browser-3921/test-output/e2e-settings-Settings-page-T-1232-默认本地模型真实保存及正式流式文本探针并脱敏读回-e2e/`，日志/截图/trace/真实退出码保留。没有后台预写、真实供应商请求或真实密钥。

当前静态链：TestConnectionButton 先 beforeTest→正式 testModelConnection，mounted/generation保护晚回执；saveBeforeTest 调用 useModelConfigurationMutation→useSettingsMutation，后者保存后 router.refresh。SettingsModelRegion 的 ModelConfigurationCard key 含配置与 hasSecret，初次保存可能令原组件在探针完成前被替换，mounted=false后丢结果。此是待trace/consumer核对的精确候选根因，不能仅据React猜测签已复现根因。

当前只准本SPEC与 `docs/verification/t1236/**` 诊断/候选：核原trace调用时序/真实UI快照、配置保存刷新与form/test实例key、成功/失败/unknown/切组和保存失败保护，提出最小现有文件修法并独评后实施。不能粗删remount key导致外部配置不回显，也不能去掉mounted/scope保护、先假展示成功、重复探针或将失败统一改warn。合法已发探针保持原ID/配置/期限和一次执行，测试当前真实保存配置；成功/失败结果须在当前配置的触发位置可读，密码不回显，切配置/离开/切scope时不得把旧结果误认成新配置。

现原外观与model spec互不修改；未来GREEN使用原模型完整case，并继续空密钥仅保存保hasSecret/公开脱敏读回/刷新，不能仅backend probe成功。现有模型按钮、三态反馈及设置风格沿oil-ui-pro/UI_RULES保基线；实际桌面/390px图由真实UI保存产生。主线程统一source冻结、单Next/fresh根/worker1/retry0，最短两分钟且保更长预算；重跑同Test ID前原FAIL图按字节保全。

不授权修改公共契约、模型供应商、真实密钥、渠道权益/配额、组归属或全局任务权。新增真正必要写点先记录精确理由；当前无产品/test源码或运行准入，诊断不能当作GREEN。最后相关组件RED/GREEN与原公共调用链、类型/边界按实际记录，不代签真实供应商或全功能通过。

## 只读候选补充（待独立评审，非实现准入）

诊断见 `docs/verification/t1236/diagnosis-and-candidate.md`。原 trace 没记录 React 生命周期，具体 remount 根因仍需组件见证：有效真实形状 put 回执、probe pending期间 rerender 保存后的服务端 VM、原配置 key 确实变化，然后一次 probe 成功必须在当前表单按钮旁可读。当前交互测试 router.refresh 只是 vi.fn，原 T501 未提供刷新后的 props，不能代签这个分支。

优先候选是将 default 探针会话控制器置于现 `SettingsModelRegion` 稳定父实例；原 `ModelConfigurationCard` 的完整配置 key 继续负责真实保存回显与外部配置重置。候选三个产品写点为 `settings-model-region.tsx`、`text-model-configuration.tsx`、`model-connection-test.tsx`，同文件拆会话控制与原按钮视图、上报真实 put 公开配置回执，再对同一回执开展一次正式 probe。普通多模态保原本地会话；不粗删 key、不改 shared mutation/HTTP transport/公共契约，不重发探针。精准写集须主会话绑定且独评后才可实施。

会话只关联当前操作 generation、实际公开资源/配置字段与 `{groupId,accountId}`；保父 mounted、事件失效、await 后 scope 和配置复核。group-only 切组即使 account 同为 null 也失效；外部不同配置、用户草稿编辑、受管 authority 替换或关闭Dialog/路由导致真实卸载，使旧成功/失败不能落到新配置。SettingsPanel切分类只是hidden，region仍挂载，同scope/同保存配置的合法在途会话继续完成，返回模型分类可见真实结果；不新增active prop/DOM监听，不以hidden取消probe。同一真实 put 的 RSC 回显只保持该代会话，不能把其它刷新冒充保存成功。公开 DTO 没密钥 revision，不能声称解决同形外部密钥并发替换的原子性；密码及密码哈希不进入会话指纹或证据。

公开 put response 与服务端真实投影已只读核对：`contract/src/resources/settings.ts`、`frontend/src/app/(creator)/settings/page.tsx:138`。按实际投影取 default 行（缺则 isDefault），baseUrl null 映为空串，temperature 为 number 则原值、否则0.6，provider/modelName/apiFormat/hasSecret照公开值；未配置仍诚实空状态。两个文件建议增加 Packet read_set，仅只读，不加入产品写集；实际 SHA 见诊断目录。公开资源 ID/userId/capability 用于本次真实回执关联，不引入密钥信息或组独立模型含义。

建议必要新增测试仅现 `settings-interactive-region.test.tsx`，原断言不减：先本次真实交错 RED，再同回执早/晚RSC、成功/真实失败/warn/未知异常、保存失败probe0、外部配置重挂、密钥/预设/草稿编辑、分类hidden→返回同会话put1/probe1结果可读、hidden时scope变失效、group-only切组/账号/真正卸载迟到、双击单次、空密钥单独保存probe0等族。其后原 settings.spec.ts 完整模型用例逐字不改并真实公共回读、刷新、再次保存及桌面/390px图；当前仍没有组件 RED/GREEN、产品修复或运行准入。

```mermaid
flowchart LR
 A[UI保存当前模型] --> B[同配置真实探针]
 B --> C[触发位置保留真实测试结果]
 C --> D[脱敏读回并刷新配置]
```

## 已独评的第四专用hook窄补充（2026-10-11）

独立评审见 `docs/verification/t1236/implementation-independent-review.md` 的第四专用mutation候选scope PASS，候选 `late-refresh-candidate.md` SHA `7eef28ba`。真实2FAIL的旧保存迟到成功/异常仍刷新新group-only scope由本任务负责，原78PASS及本次RED原样保留。正式扩展仅 `use-model-configuration-mutation.ts`，不改 shared `use-settings-mutation.ts`。

专用run可接本次operation.isCurrent：入口核验必须先于setError(null)与shared pending；真实save成功与异常两族在归还shared之前复核，当且仅当本操作已过期时转换本文件私有typed ObsoleteModelSave，专用catch仅识别本模块实例返回false，当前真实异常仍经原error路径。不能按name/message过滤任意异常，不能以resolve false/undefined冒充阻止refresh。普通保存/多模态不传guard维持原语义，HTTP真实结果和用户域归属保持。

现三产品+第四专用hook+原同组件test+任务docs是全部写集。补齐group-only A→B→A和apiFormat草稿编辑的实际失效用例，保原50断言及hidden同scope单次合法完成；执行完整组件、类型、精确lint及原模型公共case，不将模型替身或组件绿代签供应商/安装/全功能。主会话安排无运行时源写窗口，全部源冻结后才启动单Next公共验收。
