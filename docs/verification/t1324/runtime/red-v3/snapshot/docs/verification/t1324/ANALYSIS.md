# T1324 原公共预览失败与只读源链

C作者，只读分析，未执行本任务测试或产品修改。原件来自T1316已授权真实公共链，不补拍旧请求内容。

实际请求脚本 `t1316/public/runner/16-preview-readonly-diagnosis.spec.cjs` 在原group20自然cookie context下，对真实video.currentSrc发送 x-group-id=grp-e80980cf-20、Range=bytes=0-4095。响应JSON的range:null字段是**响应Content-Range缺失**，不是请求未带Range。原original-preview-response为404/not found；video原error.code4/readyState0/networkState3、duration为null（UI等120秒始终0）。task-before/after保原awaiting_confirmation。结果未采纳。

route中group读取已import未传。resolveRequestContext只有opts.groupId才进入verifyGroupSelection；两实参调用在无account时保持user/null，不具有目标G上下文。实际previewService原AiService.getTask读门不应被绕过；适配请求选择才能沿原权限读取。catch统一404没有保存具体下层throw，所以“首个具体throw是哪一条”仍不是现场直接日志证据，不追签；源码和合法请求对应足以指导窄受控RED。

原下游文件门：先requireExecTask→getTask与exec.*，再awaiting_confirmation→listResults最新manifest→精确path/video MIME→readArtifactBytes(task/out/path)，安全task目录、resolveInsideDir、敏感文件、lstat普通文件/拒symlink。当前没有显式HEAD，由Next按GET派生；直调GET(Request HEAD)不证明框架HEAD。修复只候选route一源，不扩大文件门/通用context/其他路由。

当前五个观察器PID36328/36333/36335/36351/36354独立ps exit1/stdout空，准确证明无该五PID；后台render/controller未取消。原observer exit130与产品404分列，不说AI模型失败。

实际已读源SHA如下（普通分析绑定，不冒正式input lock/独审通过）：

- `frontend/src/app/api/v1/local/execution-preview/[taskId]/[...artifact]/route.ts` 2869B `06358e495be63bb3feb79f298082f219f87631713a7044bad27348e8087d1a37`
- `frontend/src/lib/request-context.server.ts` 11031B `b4b218b8ad70fa4c627bb11e9c5f60f6de39a3afd8f7e6dd851210ac842b0c31`
- `backend/src/modules/execution/execution.service.ts` 14543B `b3cc28576842960a6b2420eea674c1fd5f849278aa3682be19b7f4803e4d83f8`
- `backend/src/modules/execution/sandbox.ts` 13487B `e145b6d8edc4c86e540a1f442325433c7a8730deb4620dbdd1181b108c63ebae`
- `frontend/src/app/api/v1/local/execution-preview/[taskId]/[...artifact]/route.test.ts` 753B `6e8fbf006b3becb33ec5291bedac6dbfe3a5267c67e9e70c1cd9d793959aa7d0`
