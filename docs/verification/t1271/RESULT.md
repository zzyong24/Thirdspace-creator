# T-1271 Codex临时会话源码交付

用户已明确不需要CreatorOS发起的Codex调用新增个人Codex历史。两处生产增量：原生共同thread参数ephemeral=true；ACP newSession仅CreatorOS有效policy分支ephemeral=true。通用ACP保默认，旧个人历史不删除，登录环境/权限/CreatorOS聊天任务账本与产物不改。

独立初评PASS[REV:b5247eee4711]，绑定稳定docs/产品定位.md。真实RED三独立失败/57通过，原retry x2重复失败原日志保留，不算九独立失败。首次GREEN含新三文件60通过与原ACP恢复case一失败（合计75/1）：原生产早已传第四个原signal，旧断言只核三个参数；独立读核后只补核f.controller.signal，不改恢复生产逻辑，补missing临时ACP会话零新会话/prompt/tool与unknown测试。第二次六文件100/100、retry0通过，含结构化provider、原durable账本复用及旧回合恢复。Source AI-worker typecheck通过；owned最小候选31/31、typecheck/build通过。build原CJS import.meta告警保留，未为消警改源。

原生0.159.3实际隔离探针接收ephemeral=true，响应path=null；原进程可read、无rollout、重启后不能恢复。没有模型turn；空durable负对照也未落rollout/list，因此不把空会话试验冒充完成对话或个人Desktop历史界面实测。详见native-probe/RESULT.md。

Timeout完整门通过，boundary新增0（旧5保留），orphan退出0/旧100WARN保留。pmem已实际同步；完整reconcile在途，未签全局绿。初次reconcile在pmem工具返回在途时启动，顺序不完整；原运行保留，待完成后按已结束pmem重新取得顺序正确结果，不复用成正确顺序PASS。

当前共享目录另有T1261/T1265等既有增量，已实际保存六路径基线，功能仅窄增量应用，不覆盖或提交他人修改。独立工作树从ed9cfbf8d4cb38fdb188abb11a82442899f9a29b形成五文件最小代码/测试候选；独立候选31例与共享100例各绑定自己的源码/依赖事实，不当成同一树。共享ACP恢复signal断言属于当前新增消费者，旧HEAD源码没有该第四参差异，owned不伪移植旧消费者修改。

本任务是内部协议源码交付，没有新页面或frontend journey，验收列初建误填待验已按非UI类型更正—；并未豁免原SPEC的协议/恢复/测试与流程门。当前运行安装版未替换，不能说它已启用此改动；个人Codex UI及完成模型回合未实测。发布/安装不由源码提交冒充。
