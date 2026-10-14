# T-1288 校准合并剪辑后的两个契约测试库存

用户已授权合并完成会话并实际运行全部回归。本叶登记 R 真正全契约 43FAIL/475PASS（78文件、518项）的固定库存失配，不改变产品接口或实现。

R 原 HEAD=03d60d39c899c08f15c6cebee3d2516079c45a74、MERGE_HEAD=e651ea4d0e32ca384ea2eba77106f4e699ccd9cc。原42个入口检查仍要求427，剪辑已批准并合入的两个 POST 接口使实际429；原穷尽表缺相同两项。真实日志与逐条失败保留在 docs/verification/t1278/integration-candidate/r-current-tests/contract.log。

## 精确范围与合同

只改 contract/tests/endpoint-bootstrap.test.mjs 与 contract/tests/registry.test.ts。只将固定427更新为429，并补 POST /outputs/:outputId/production/editor/script/read、POST /outputs/:outputId/production/editor/script/propose 两个已批准接口；读原 T1274 SPEC、contract/src/operations/production.ts 和服务契约核方法、路径、ID。所有入口启动、旧legacy导出同一性、完整穷尽、唯一性、无额外路由、安全schema断言保持。不得动态计算期望库存或从ENDPOINTS生成allowed、删除测试、改生产或批准新服务。

候选先独立审核准确必要性与全部断言，再由Root串行应用。原失败是当场RED，不补拍；同原78文件/518项完整契约重跑 retry0，contract类型复核。若生产实际注册与批准合同不一致登记产品根因，不用测试洗绿。固定绑定若后续迁移/代码变动需重核，不重签旧日志。收尾使用pmem sync、reconcile、taskctl及真实提交；父任务包/浏览器/App另验。

```mermaid
flowchart LR
 A[已批准剪辑两接口] --> B[合并后固定库存429]
 B --> C[保穷尽和所有入口检查]
 C --> D[原全契约重新实跑]
```

## 全worktree合并后的固定432库存复核

原429集与78files/518PASS完整证据保留。合Main受保护0b091检查点时，Main另有原T1255/T1268已审三个日志接口 GET/PUT /settings/log-reporting、POST /local/observability，确切ID分别settings.logReporting.get/set、observability.exceptions.capture。最终必须保R429集合和Main这三项的全部已批准功能，完整并集432；原两测试准确改固定432并合原静态三行，不改生产/删除入口/放松穷尽。读原SPEC/service契约及两侧blob独立recheck后Root接入，完整全契约与类型重新现场跑；不能用旧429PASS签432。精确候选和已合code见docs/verification/t1290/merge-resolution-candidate/12_INCREMENT_BINDING.json及merged-increment-files/contract/tests两文件。
