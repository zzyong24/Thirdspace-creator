# T1048 图文工作台前端交付

代码已冻结：只含 changedFiles.json 的8个前端文件；4个原文件 baseline 在 base/ 与 baseHashes.json；fileHashes.json 是最终代码哈希，delta.patch 相对 baseline。不含 root 所有的 canvas helper/contract文件，不含隔离树其他旧WIP。

主面是整组网格与选中页。真实页 ID 贯穿逐页候选、bundle 与精确采用；文字规划及旧未绑定候选仍可审阅。每次最多12项是服务容量，更多页按原队列分组，原请求未知及未提交分组按账号/作品保存在 sessionStorage。页生成沿同一结果轮询，局部重试支持服务端 retryRequestId 原预约恢复。同批逐页采用每次读当前版本；409明确冲突可再审阅，未知采用原请求保留。

封面复制独立用途不拆页绑定；图片导出按真实页序、相同精确文件去重，zip包含图片、配文与精确顺序清单。旧未绑定照片可继续选取、保存和导出。画布调用 root openGraphicPageCanvas；先保存，晚到新增输入阻止离开而保留稿；Kuaitu只是选中页细调。

文档操作/三项候选行为/recovery/retry未知均有当场RED→GREEN日志。export-red是Vitest/jsdom跨realm字节问题（文字的strToU8返回Node U8被fflate误当目录），未当作真实客户端bug；最终统一字节realm并严格unzip检查真实字节、顺序、配文。旧工作台第三测试的旧AI弹层断言改为新主面+统一方向可键盘操作，原两项保存/保留来源ID回归仍通过。

最终4测试文件29 PASS，限定4源文件ESLint 0 errors/0 warnings。全类型检查只有23条未复制的既有public/courses JSON TS2307，无本次代码类型错误。没有运行真实浏览器、模型、截图或视觉Gate，不标真实UI验收完成；root需完整树类型、LED047与真实图片链验收。
