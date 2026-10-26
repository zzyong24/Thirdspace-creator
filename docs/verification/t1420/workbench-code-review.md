# T1419 / T1420 / T1421 工作台实现独立复核

2026-10-26；继承宿主模型的同构会话，未核实具体型号。本人审核过三份规格，未实施本轮产品改动。本轮只读产品及测试代码、历史原生源码归档和已有日志；没有运行测试、模型、用户 CLI、浏览器或安装。只写本报告。基线 HEAD：`98008e5170424ab9ca95186717fcbb636c7e137c`，结论绑定下表未提交文件字节，不把其它共享 dirty 归入本任务。

## 结论

首轮发现两项 P2 兼容问题；本次定向复核确认 CODE-001、CODE-002 均已解决，当前所审实现没有未关闭的代码发现。原发现与原文件 hash 留存，下文追加本次修复依据及新字节绑定。新版尚未安装，本报告不代签真实 UI、剪贴板、原生 PNG 像素、模型语义质量或产品完整验收。

## 具体发现

### CODE-001：有可用脚本的空卡旧稿仍被禁用重组（T1420，P2，已解决）

- 位置：`frontend/src/features/projects/graphic-post-workbench.tsx:198`；关联 `frontend/src/features/projects/script-first-content.ts:14–18`、`contract/src/resources/graphic-posts.ts:26–29`。
- 输入：有效已保存图文 `body=""`，`cardBriefs=[{cardId:"c",title:"",body:"",sourceRefs:[]}]`；绑定脚本 `state="ready"`、真实 `scriptRef`、非空 `scriptText`。schema 允许空标题/正文，不能以非法稿排除此输入。
- 因果：`inheritGraphicScript` 遇到非空卡片数组就原样返回，不把脚本填入 body；新按钮只看 draft 正文及卡片文字，所以被永久 disabled。旧按钮以可读脚本为条件，会允许这份合法稿重组。
- 受影响合同：T1420 最后一段“主脚本与当前图文都为空才禁用按钮并指向脚本”。这里主脚本并不空，结果却无法到达读取/生成候选链。
- 最小建议：按钮启用条件包含可读真实已保存脚本 OR 当前稿内容；保留既有 prepareForTurn 的保存、版本与 digest 核对，不改通用继承行为、不造来源。补上述空卡占位+可读脚本用例，同时保留无脚本旧正文可用、两边都空禁用。
- 证据级别：静态控制流及 schema 确证，未执行新运行复现。现有新增工作台用例只有“无脚本但非空正文/卡片”，未覆盖本分支。

### CODE-002：立即收起 Doocs 会取消最后编辑的草稿暂存（T1419，P2，已解决）

- 位置：`frontend/src/features/article/doocs-article-editor.tsx:144–151` 与 `:261–268`。
- 步骤：打开历史 Doocs 稿的“调整排版”→改变主题或正文→在500ms暂存计时触发前点“收起排版”→等待任意长时间后刷新。
- 因果：onChanged 已把修改放入当前 value，但 effect 的 sessionStorage checkpoint 要500ms后才写。收起成功设置 `formattingOpen=false`，使 `editable=false`；effect cleanup清除该次 timer，随后因 `!editable` 直接返回。收起动作只导出预览，不提交正式版本，也不更新 checkpoint。最终修改只留当前 React/native 内存，刷新后无法从原草稿恢复；有旧缓存时会恢复更旧内容。正常500ms窗口因此被扩大为整个收起状态。
- 受影响合同：T1419“切换风格不改变正文或丢失未保存编辑”“保留原稿、旧版本和上下文”；恢复原生编辑不应降低既有暂存能力。
- 最小建议：收起前同步真实 snapshot 并刷新既有草稿 checkpoint，或允许这次已接纳编辑的暂存完成；隐藏纯交付态继续拒绝新修改，保留版本冲突规则。补“修改→500ms内收起→等待→重挂载恢复最后稿”的兼容回归。
- 证据级别：静态 effect/cleanup 控制流确证，未运行新测试。现有新 Doocs 测试仅展开、修改、立即保存，未覆盖收起和刷新恢复。

## 其余主路径核对

| 范围 | 已读实现与结论 |
|---|---|
| NoteRelay 主题 | simplified 下选择项来自真实 metadata.themes；change 验证 noteRelayLayout 后交 onLayoutChange；已存 nativeLayout 优先，未设置公众号维持石墨，未设置图文采用现有 minimal。原文、图片与选中稿主题没有在选择时被重建成另一套系统。候选 readOnlyCandidate 仍锁布局。|
| Doocs 编辑/保存/导出 | 同一原生实例通过 editable/inert 显隐，展开后原生 onChanged 与原 snapshot 保存端口继续工作；收起使用真实 export-html 形成净化预览；没有强制转成 NoteRelay。saveEditorDraft 取实时 snapshot，复制/导出保留 prepareDelivery、正式回读及原生内容一致检查。除 CODE-002 外未见新增覆盖正文路径。另只读检查源码 tar 的 apps/web/src/native-entry.ts：原生 CodeMirror 更新与主题 watch 同步产生 onChanged，未凭旧测试名字中的300ms推定真实事件延迟。|
| 图文投影/旧稿 | 非空 cardBriefs 时发布正文/全局标题不再另铺一页，仅卡片与已选图进入图片投影；无卡分支保留原正文导出。cleanMarkdown、代码块保护、imageUses 精确引用/顺序和同图复用沿用；新发布配文独立展示与复制，复制前走 save。未按字数/关键词做语义拆页。|
| 重组与采纳 | 去掉必需脚本参数，现有 prepareForTurn 仍先保存并比对完整已存版本/digest；rednote 局部提示与真实 chatbox-turn 系统提示同步允许无脚本旧稿，公众号原规则保留。不补造 scriptRef；重组动作只打开候选对话，现有显式 saveWorkEditorCandidate 采纳、generation/版本/迟到回执守卫未删除。CODE-001 属按钮判据遗漏。|
| 视频入口 | 无视频操作调用真实 open-addon materials；有视频先 NativeSourcePanel 探测/登记声音，再由真实已登记 hasAudio 来源显示 ProductionTranscriptPanel；defaultOpen 只展开表单，不自动 create ASR。文字剪辑区排在其后，更新剪辑内容继续 refreshContext/prepareDocument；粗剪候选折叠但未删能力。|
| 视频保存安全 | 原请求恢复、revision、原片 addWholeClip:false、显式 ASR 采纳、全文无时间码的诚实降级，以及独立图层和原剪辑回执/撤销流程未改为隐式采纳。没有新增付费自动调用或导出算法变更。|
| 许可 | 移除两个文章编辑器创作区许可控件，源码/许可证归档本轮 diff 未删除；视频原有更多菜单仍保留 notices，与本次文章/图文范围一致。|

## 读取的已有运行证据及限制

- `t1419/green.log`：4文件45项通过；`t1420/green-rerun.log`：3文件43项通过；`t1420/green-worker.log`：2文件4项通过；`t1421/green.log`：3文件44项通过。这里只核日志原文，不将次数相加为不重复总覆盖，也不冒充本人执行。
- `t1420/green.log` 原先实际为7失败/52通过：包括测试查询重复匹配，以及2份 T1307 原资料缺失引起的原生用例失败。后续43项只证明该轮收集的3个文件，不能把这份原59项执行改写成全绿。`restored-test-inputs.json` 是输入恢复记录，不等于原失败项已重跑通过。
- 所读 `native-bundle.test.ts` 的既有手写2页用例保留真实分页与ZIP管线，像素捕获明确使用夹具。当前 diff 未见新增“修改后 projectGraphic → 原生分页 → ZIP”关联用例；该公共链路与真实图片像素/安装 UI 仍须实际验收证据，不能凭换色或文案通过声称完成。
- 新增 Doocs/NoteRelay 工作台组件测试大量使用 native surface seam；它们可证明宿主回调，不能替代实际原生主题控件/样式显示/系统剪贴板及安装态操作。没有把这些尚未运行的旅程追加成新产品范围。

## 首轮审核文件字节绑定（保留修复前原件）

| 路径 | SHA256 |
|---|---|
| `frontend/src/features/article/doocs-article-editor.tsx` | `e7561ef2780f8fd9e2c5d2f6efa9a089b85c568f2170b58ce080c7ac408b185f` |
| `frontend/src/features/article/doocs-article-editor.test.tsx` | `b3b4a13976e4cf9d9b133d02a063c423ec40d25e2e9c8a2ccfb91a332c6f92cd` |
| `frontend/src/features/article/article-workbench.tsx` | `f3108546acff1f353f02bf7f0d90535fa051e0c8d4ef00b1dcc43f46d42656b3` |
| `frontend/src/features/reference-editors/noterelay/noterelay-editor.tsx` | `31e9c4e7ae40e4838b799c56b4fabea490853c4cf603c38d831e74f197394755` |
| `frontend/src/features/reference-editors/noterelay/noterelay-editor.test.tsx` | `742e9748d4185c06574c0ee49b34815a6baaff4dec7d3bf4020cedab7ef2b73b` |
| `frontend/src/features/reference-editors/noterelay/projection.ts` | `feaaaffe88f284c0104861d92ea6cf75405b581934f845a8450ab2e11799f67e` |
| `frontend/src/features/reference-editors/noterelay/projection.test.ts` | `6940971c549361d8df2d781d06382cb73929d09cf9f3d471656da576514d52d4` |
| `frontend/src/features/reference-editors/noterelay/native-bundle.test.ts` | `a58450d78c84fa0d7830b62c487908561144af670a9bbe77582e0ea044c99e34` |
| `frontend/src/features/projects/graphic-post-workbench.tsx` | `726883cd43e86baa90c95b8fbf547800c1b8108e8dc9cf63b6c77ce045370374` |
| `frontend/src/features/projects/graphic-post-workbench.test.tsx` | `abd4ce7806171883c54a47bcdd74e6558303b9ce12adad6e4cbd6be560831bf8` |
| `frontend/src/features/projects/script-first-content.ts` | `ea24046c023997b72b62a8663d5acafe8778de28adc2c500f5c091a16d7842aa` |
| `ai-worker/src/prompt/templates/chatbox-turn.ts` | `ce15e6638f0d65297fcb0d0eb6b8e2590327307e22149ed43a9d0cc378030eaa` |
| `ai-worker/src/prompt/templates/graphic-post-text.ts` | `01ee7bb43f4b7f100a9509bef51d043b1516b02530b6b6901724610512852e30` |
| `frontend/src/features/reference-editors/video-reference-workbench.tsx` | `cb1961f6bf8d371fb73f5fb5ba2b0da1535d9f8189aef3af2a9d8644434034bc` |
| `frontend/src/features/reference-editors/video-reference-workbench.test.tsx` | `b06c8169ea4763de8008ad0dc309a1e57ceb91a2684b15186b7311ea41bc4d8e` |
| `frontend/src/features/reference-editors/native-source-panel.tsx` | `77aaf3baf15c5144c04f4ddf6403fdd2e2ef0dfd0530657d7596fbf69490fcd3` |
| `frontend/src/features/reference-editors/native-source-panel.test.tsx` | `9142df99de5a5c3f624d30a7454c1a9f56af7d428e96c042b5424e2b0913e86f` |
| `frontend/src/features/production/production-transcript-panel.tsx` | `dbc4cf8725e940bf89ff63611baf9e437b57cb526fb591b70058ac5cd5ac755e` |
| `frontend/src/features/production/production-transcript-panel.test.tsx` | `0508f45de595495b339d85a68beac590f1f6feaac5e36bd2ba40687f154b61bc` |
| `docs/features/t1419-article-workbench-style-restoration.md` | `ed54e44a1fda04b519934e3506f577689816c657ce4acba3fbd86ad5d9f6b1b4` |
| `docs/features/t1420-graphic-post-content-structure.md` | `8a0073ade7365dccd4c8e0e5823d59baec166740b23bb00642e370ff744c1567` |
| `docs/features/t1421-transcript-editing-clarity.md` | `3c32688fbaaf5e829101db9daab57f71c3c8eeb9d3871c46e9bbc54377cf46e3` |

## 两项修复定向复核（2026-10-26）

已只读复核下列增量和父会话实际运行日志；没有重跑测试或业务。

- **CODE-001 已解决**：重组按钮现为当前正文/卡片内容 OR `scriptContext.state === "ready" && scriptRef && scriptText.trim()`。`inheritGraphicScript` 与候选保存协议未改；合法空卡占位不再屏蔽真实主脚本。新增测试“旧稿有空卡但主脚本可读时，仍可重新组织”使用原 fixture 的空 body、非空但空白 cardBriefs 和真实脚本引用，实际触发原准备端口后打开对话；不是只检查布尔 helper。
- **CODE-002 已解决**：收起前读取真实 `snapshot`，经过 alive/原 native handle/当前稿 fingerprint 核对，再调用原 `export-html` 并再次核对原稿或精确 snapshot fingerprint。成功后同步 `next.document`、markdown 和 layout，并在隐藏前同步写入同一 owner/version 的原 sessionStorage checkpoint；不调用正式保存、不自动采纳。既有 checkpoint 非空时继续保留原件，不覆盖旧版本恢复证据；原冲突/恢复规则未删除。scope/output 变更沿原 keyed session 卸载使 alive 失效，旧回执不能写新会话。
- 新 Doocs 回归在原生 surface seam 中直接放入尚未通知的最后正文和主题，然后立即收起，检查 checkpoint 的精确正文/主题；原组件卸载再重新挂载后，实际点击“恢复未保存草稿”核对恢复内容，且断言未调用正式 onSave。该用例比仅等待500ms的检查更能证明收起边界。测试名中的300ms是合成未通知状态说明，不是本轮对真实 native 事件延迟的实测结论。
- `docs/verification/t1419/rapid-collapse-red.log` 原执行是1文件14项：新用例1失败、旧13通过；失败因 checkpoint 为 null，直接命中原缺口。该 RED 原样保留。
- `docs/verification/t1420/review-fixes-green.log` 原执行是2文件31项全部通过，所收集为 Doocs 与图文工作台两个文件。该轮证明两处修复及原相关兼容回归，不重算为全工作区、所有原生分页或安装/UI全通过；图文空卡用例未另见旧实现动态 RED，不补造其历史红测。
- 本轮修复没有扩大产品/SPEC/权限/付费调用/发布范围，没有新增未关闭的代码发现。上文原 T1420 的59项失败、后43项覆盖边界，以及真实原生分页/安装/UI待验限制仍然有效，不被本次31项替换。

### 修复后文件与运行证据绑定

| 路径 | SHA256 |
|---|---|
| `frontend/src/features/article/doocs-article-editor.tsx` | `9d9f163550e0985b434efd307ab65829bf104c3d51401ec50f0074d5e147b189` |
| `frontend/src/features/article/doocs-article-editor.test.tsx` | `45489c08f643e2d5014f3bfbef118697326865fd543efdafd2dea7812d39fad4` |
| `frontend/src/features/projects/graphic-post-workbench.tsx` | `726883cd43e86baa90c95b8fbf547800c1b8108e8dc9cf63b6c77ce045370374` |
| `frontend/src/features/projects/graphic-post-workbench.test.tsx` | `abd4ce7806171883c54a47bcdd74e6558303b9ce12adad6e4cbd6be560831bf8` |
| `docs/verification/t1419/rapid-collapse-red.log` | `1a30490650555cb83ea172677a47037a9ed8144e05f02b3fa4e3e26f11aa72e0` |
| `docs/verification/t1420/review-fixes-green.log` | `d0660d51f5f2fa0421ab2941dd6bb8f84148c8fe4c5ab4c701d426c49880ca58` |
