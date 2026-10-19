# 原生编辑器的组范围补充检查

2026-10-05，只读冻结来源c5316506，不构成运行PASS。

`frontend/src/features/reference-editors/native-editor-contract.ts` 的 NativeEditorOwner 只有必填accountId/outputId/sourceVersionId；`native-editor-surface.tsx` 挂载身份、迟到回调与effect依赖都只有这三个值。账号组没有进入原生实例的生命周期身份，因此只在请求头带groupId还不足以证明切组后旧导入/保存/生成回调不会写到新组。空组的accountId又不能伪造。

集成时按已批准的共享创作范围，原生宿主与真实服务端父工程保持同一组身份；组切换必须取消旧实例及在途请求、迟到导入回写，不拿平台筛选重建或藏掉共享工程。改共享native契约要同时核对四类原生源码/复制合同/对应source archive与hash manifest，不改一个副本就冒充全部已接上。实际native lifecycle、空组、同组跨平台及账号转组拒绝读取/保存后回读均待完整树验证。
