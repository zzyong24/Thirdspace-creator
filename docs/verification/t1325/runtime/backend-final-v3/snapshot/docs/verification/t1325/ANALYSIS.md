# T1325 只读职责分析

C在Root授权shortcontrol窗登记。未改产品/测试、未执行HTTP/模型、未读DB/凭据。原v6来自B独立执行的完整受控production root，日志/exit与真实下载解码由原case证据共同绑定；当前仅核安全原log、consumer源码，不能把本分析称独立重跑。

真实首可见拒绝：creativeResults.adopt→creative-results.service.ts:327–328 adapter.probe→article media adapter.probe→persistence probeCard当前copy.generate/image.generate readiness→MODEL_NOT_CONFIGURED，card/edit两例失败。cover直任务用户确认不是本generic creativeResults.adopt，不因这份原1PASS就签其余owner。

已核全部实际adapter probe：文章text限定textkind/可用sections后测text；图文text限定title/body/summary/tags/cardBriefs后测text；output_script限定script后测script.draft；publication text限定kind后测text；article/graphic媒体各核owner/outputType/kind后测cover/card；publication cover核kind+platform+video/image后测cover。当前装配中这些model探针无额外workspace/entity权限副作用，但其静态类型路由职责不能消失。真实权限在scopedResult/output、assertWritableWorkspace和各owner.read/adopt中继续；独审需逐一核，而非按错误码泛跳probe。

media owner.adopt还核原task/business/output/绑定、真实asset/file与当前/原base、editedValue完全来自原媒体、section/文字basis一致，再原confirmTask与createVersion CAS；没有理由以新模型readiness代这些真实门。generic service原adoptionReceipt在probe之前，同body回放已成功结果不触探针；当前问题发生尚未采纳的已生成候选，不能通过先造receipt解决。

原v6失败run与相关源码哈希如下，仅当前分析绑定，不冒正式审前input锁或产品START。预计一generic service候选W，若静态边界无法在此维持应先delta独审，不触T1322两源。

- `backend/src/modules/creative-results/creative-results.service.ts` 41043B `b794d931d4bf3cc50eafd7a1690706d0389cda1712968117ac68b01aa2dbe4d8`
- `backend/src/modules/creative-results/article-cover-media.adapter.ts` 23599B `1b973b2f865c8ab269ee59135b6da710239a63332af5590d14a0cf9dbc67aae2`
- `backend/src/modules/creative-results/graphic-post-media.adapter.ts` 29670B `8bdc78965097a1791a535fcb5e88ace9f7042266ab522f888053ac2c6c19ed45`
- `backend/src/modules/articles/articles.creative-adapter.ts` 7197B `7655bdd09c7a8c82fa9caa033ff77679f506626b6f3bb6052e0d3f9c2086571c`
- `backend/src/modules/graphic-posts/graphic-posts.creative-adapter.ts` 3408B `b0bdedcf13fc21f6848f09e3513567f7d6934b287e387eedd8bbcd642adfdd34`
- `backend/src/modules/output-scripts/output-scripts.creative-adapter.ts` 2390B `c0e90f831318c1ba05c7bdb052b27f264e76914dca30b68f4a5ef07bda4e7326`
- `backend/src/modules/publishing/publication-results.creative-adapter.ts` 4381B `c2f2abbc9ccd1a6aa7879aa9dc953bb97eebe8654c62802e88680135438cddaa`
- `backend/src/modules/publishing/publication-cover.creative-adapter.ts` 13823B `b4a5f14639786eba2eaf02853c4e5fdf7f8716fbe2749e71b9f8cb3262ec9482`
- `frontend/src/server/persistence-client.ts` 472734B `2503085236dcdace8d8f5368faaab44bd1a40ed938294fe25fa00c8088faa0de`
- `docs/verification/t1322/runtime/protection-v6/execution-result.json` 547B `e4548d76352f5371986e956e875855eacc2f7c22019e9100261242515f790693`
- `docs/verification/t1322/runtime/protection-v6/output.log` 3731B `7fa76e2af5f0fc2d605beb0b08b5da6e94630945c2f5cb6a5dd377778d9fa379`
