# T1324 独立初审

结论：未发现阻断该最小方案的实质问题，建议进入正式锁定与审核记录。此为独立设计初审意见，不是自造 reviewctl 收据，不授权产品或测试执行；最终来源锁、精确测试W和新公共RED仍须按流程发生。

输入实核：SPEC `docs/features/t1324-group-execution-preview-context.md` 4960B / SHA256 `00d6753735e11349912603df4bf1c8d11feda389351f8348007db527aa897fb4`；ANALYSIS 2581B / `ac1bda317920f5048fe8adbf7fd45814eafb5420df582065931cacb05a795732`。已读 BACKLOG、本两文、真实route/context/runtime/execution/file实现、原parseRange测试及原U16请求/状态证据。未读作者自评代替源码。

## 已核故障与边界

route.ts:42–45 确实只把 session/account 传入 resolveRequestContext，尽管已 import readRequestGroupId。request-context.server.ts:113–120 仅依据第三参数 opts.groupId 执行 verifyGroupSelection；header/cookie选择自身不授权，后者再按实际身份验owned组及所选账号membership。补传原读取结果可沿既有验证链恢复G，不能直接拼ctx或绕getTask。

```mermaid
flowchart LR
 A[原header或cookie选择] --> B[真实身份与账号组验证]
 B --> C[原任务属主与exec命名空间]
 C --> D[待采纳状态与原manifest]
 D --> E[原沙箱文件门]
 E --> F[原bytes及Range响应]
```

persistence-client.ts:7352–7355 的 readVideo 仅委托 executionService.previewArtifact。execution.service.ts:134–143/218–237 确认先走真实AiService.getTask、exec.*、awaiting_confirmation、该任务最新manifest精确path与video MIME，再读文件；sandbox.ts:241–253 保resolveInsideDir/敏感文件/lstat普通文件门。候选route一源只修请求选择遗漏，不触碰这些下游权限、清单、文件或采纳守卫，范围可执行且最小。

原公开诊断脚本实际使用 page.request.get(currentSrc)，请求含 x-group-id 与 Range=bytes=0-4095。原response记录404/not found，range:null为响应缺Content-Range；不是请求没带Range。原task-before/after SHA完全相同 `49d9eb852ee771f043264de0c163fcdbd39d1e31c3d98c311ae68c876d3c708d`，仍awaiting_confirmation；原observer停止不代表后台取消。源码遗漏已确定，但原route catch压成404，原现场最早下游具体throw仍未直接观测，文档没有冒认。

## 完整验证要求的可执行性

规格明确新owned真实公共任务/生产执行服务实际产出文件与manifest，再走真实GET→resolver→runtime→previewArtifact→sandbox，禁止mock context/readVideo或直接捏manifest充完整RED；这是关键。外部供应商/渲染边界如采用受控方式，必须标明实际替代处，不能把文本伪mp4或人工结果行当合法原生渲染。前RED未命中目标应先保夹具/环境失败，不按源码猜测改后追签。

纯G header/cookie两条、合法G+filter和legacy、header优先、真实membership、跨user/group/错账号、缺任务/命名空间/状态/MIME/清单、完整bytes/closed-open-suffix Range/416及原cache/MIME/disposition均列入；读前后完整task/results/业务DTO不变与0采纳/0重发可机械验证。跨user应通过真实owned身份/session路径；不能mock resolver让任意user进来。若要声称具体文件守卫已到达，应使用原真实manifest命中的文件后受控替换为目录/symlink/移走并恢复原件；被manifest更早拒绝的请求只能证明该前门，不能错签lstat覆盖。这是现有门覆盖的证据口径，不扩新产品守卫。

当前 route 未导出HEAD。已只读核本机Next实现 `frontend/node_modules/next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js:36–44`：框架自动HEAD会复用GET处理；响应发送的空body等仍须真实框架验证。规格已正确要求新不可变包的实际HTTP GET/自动HEAD、cookie自然video请求/Range及播放器加载播放，直调GET(new Request(...method:'HEAD'))仅调用函数，不能签框架HEAD。无需为测试新增HEAD handler。原parseRange两用例仅辅助，保持只读。

新包公共复验、原合法采纳/资产读回/下载/解码与本地组合通过分列，不能仅凭沙箱MP4存在签功能已恢复，也不能为了验收重发原6661或复制旧DB。若原输入无法合法跨新root复用，按文档由Root决定必要新fixture，不能为补证任意付费。现阶段无新模型、HTTP、测试、生产或控制命令执行。

运行前仍需C冻结实际route/context/runtime/files/contract/identity/公开任务执行依赖与测试/config/产物路径bytes/SHA；预算、own cache、错误原件、安全扫描与精确PID清理要求已写定。SOURCE与执行包尚未完成，本初审不替其背书。当前唯一评审文件写入完成，RELEASE全部本次写权。
