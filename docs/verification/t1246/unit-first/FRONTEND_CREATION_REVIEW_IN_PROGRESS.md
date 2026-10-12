# 原创作组件fixture与当前冻结客户端的只读复核

冻结533224f。原first完整38file/158FAIL，未改源/断言或抢跑复测。执行源SHA见frontend-creation-source-binding.json。下述静态前置不可冒充全部用例动态同因。

## quick-create 3与publication actions12：旧全局mock不消费当前typed workspace client

quick-create-work.test:13只mock @/lib/contract-client；生产quick-create:21创建原session，project-creation:134 verifyAccount经operation().client、:150–151 createProject/createOutput同源。operation用createCreationWorkspace/readCreationScope，creation-workspace-scope:53 capture建createClient(ENDPOINTS,transport)，:58真实fetchCreatorApi到dispatch，非旧global client。旧mock因此不提供当前可达公共端口。first3真实红含push0及泛化“创建未完成”，没有HTTP请求body录制，具体下游合同仍待。

publication-result-actions.test:8也只mock旧global client；生产:45/87局部shadow为useCreationClient。first12真红包括旧spies0、未生成/采用控件。共同mock前置缺口成立，但不能推定12项均只此原因：dirty/current revision/unknown/cover/model能力与新发布合同需逐case复验。

最小候选仅两原test，按已有真实scope冻结和public typed input/envelope经本文件HTTP adapter消费（可参已有T1179批准同机制），保scope/epoch/signal/assertCurrent、account/group真实合成选择，不mock冻结hook，不放宽schema。保多作品创建部分成功与原键重试、选中来源正文/不多模型、封面精确asset bytes/expectedAbsent/current revision/CAS/dirty保护/轮询编辑不覆盖等全部原断言。具体合法DTO及路径需独评，不仅接回旧mock函数即签成功。没有生产架构调整/第二客户端服务请求。

## 明确不能混同的其它文件

- work-editing-recovery.test:131已有T1062 COMPONENT_PORT_SEAM，真实workspace/capture/signal/epoch/lifecycle保留，业务spies由原op.assertCurrent前后保护；两个现红“选择已有图片”不能套用缺全局mock原因。旧媒体选择UI是否已退役/替代入口尚待核。
- new-project-dialog.prefill旧T247两例期待creation-mode radios/getPreferences；当前新建表单路径/创作方式方向仍需批准SPEC复核。没有仅凭删除旧DOM宣称新方向正确。
- chat-diagnosis-card1原例空draft已actual确认到confirm阶段，但只等旧/锁定失败/文字。真实chat-result-cards:167–182取不到draft时phase error、:277现文案“尚未确认锁定完成，请查看原任务状态”。文字差异成立；原不lockPrediction、不假locked断言位于失败之后，首次未执行，批准任务恢复语义与原例实际复验仍待。最小候选仅该原test精确诚实状态文案并保原不写锁事实，不弱化生产门。

~~~mermaid
flowchart LR
 A[旧test全局client mock] --> B[没有接住当前capture请求]
 C[当前组件] --> D[真实workspace捕获范围和signal]
 D --> E[typed client到public dispatch]
 E --> F[需本file合法HTTP DTO夹具]
~~~

这不是产品全功能/官方模型/真实平台或原生App验收；first红仍原样保留。
