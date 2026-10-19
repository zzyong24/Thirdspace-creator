# T1330 局部图片恢复实施结果

当前结论：局部实现与34项受影响组合回归通过；完整新候选包的真实图片像素/操作验收待C统一装配后执行，不能据此宣布T1330全功能完成。原T1314公共破图FAIL与T1321 UNKNOWN保持冻结。

## 改变与归属

原生宿主本轮已下载图片生成ObjectURL，Rednote适配器调用原DOMPurify后src被剥离。修改仅在`adapter.render`之后、`preview.replaceChildren`之前，同步扫描本轮局部root的真实`img[data-noterelay-source]`，按冻结`frozenUrls`精确命中恢复宿主登记URL。没有放宽全局URI/HTML规则，没有改变下载、模型、采纳、正文、分页、导出、取消或URL生命周期。

原公众号适配器经过同一点，新增两次load的精确registered URL断言，并保留其真实HTML导出DataURL断言。这是产品修改后补充的受影响回归，不补签公众号历史RED。

## 修改前证据与失败保留

- `runtime/before/INPUT_LOCK.json`在产品修改前锁定11份源/产物、6份旧公共证据和固定生成目标。原U14公共RED来自旧完整7790包的settled原件：下载PNG200且SHA相等；实际openShadow内两img src为空/natural0；正常关闭可返回原卡。副本只用于关联，不重写原件。
- `runtime/RED_TEST_LOCK.json`与`RED_RESULT.json`锁定真实旧native bundle测试；3项新测试均因合法注册图src=null失败，17项跳过。原项目默认retry使日志出现9条失败断言记录，未隐藏或计成9项测试。随后所有GREEN显式retry=0。
- `fixture-cwd-misfire.log`、`fixture-parse-failure.log`是测试准备失败，不能计产品RED。
- 产品修复后首次完整20项为19通过/1失败（`green-fixture-negative-assumption-failure.log`）。负项原夹具错误期待html:false下伪造原HTML生成img；实际消费者正确显示纯文本、节点不存在。保留失败后改用真实Markdown未登记source/blob与伪造HTML无节点断言，没有修改产品迎合断言。

## 当场验证

| 检查 | 实际结果 |
|---|---|
| native-bundle完整20项，retry0/test120s/hook180s | PASS |
| noterelay-editor组件8项 | PASS |
| projection正文/图片归属6项 | PASS |
| 三文件合计 | 34 PASS / 0 FAIL，`runtime/green-affected.log` |
| 原确定性build-noterelay | exit0，`runtime/build-native.log` |
| build-noterelay --verify | exit0，`runtime/build-verify.log` |
| boundary-scan --quiet | exit0，`runtime/boundary.log` |
| frontend tsc --noEmit --incremental false | exit2；6条TS2339全部来自另任务新增group-script-draft-preparation.persistence-client.test.ts的artifact.id类型，当前T1330源/测试无报错；原日志保留，不跨scope修正 |
| timeout-policy/verify.mjs | 整套exit0，`runtime/timeout-policy.log` |

组合测试实际使用编译后的原生ESM、原适配器和原净化器。覆盖注册图精确URL、换稿/卸载回收、双实例/旧轮隔离、未登记source/blob、伪造HTML/脚本/事件属性，原文字图卡/页序/版式/公众号HTML与PNG/ZIP管线也保留。JSDOM沿原测试stub decode，PNG/ZIP测试明确使用像素夹具；这些不证明真实浏览器解码或实际导出像素。

## 确定性生成边界

`runtime/GENERATED_BOUNDARY_PROOF.json`列出六项产品/测试delta与全部SHA。manifest中其他三个编辑器子树深等；六固定复制目标逐字节未变，五legacy目标前后均不存在；source.zip逐member只有web/native.ts改变，七份LICENSE/NOTICE内容未变。全局obsidian净化shim、builder及许可库存保持原字节。控制面/ledger由C管理，B不做exact rebind。

## 仍需完整公共GREEN

由C装配并绑定完整新包、owned根后，按实际公共UI打开保存图文与原候选预览，核960×540原图自然尺寸/颜色/图形数量/来源SHA，真实翻页、关闭与刷新，并独立实际看图。不得替换旧包静态文件、注入dataURL、重发原模型root，或用当前组合PASS追签旧T1314完整U14 PASS/T1321首因。

本轮没有新模型请求，没有更改共享candidate进程/配置或重建共享包。原T1314全部业务/模型窗口已明确释放给C。当前阶段仅实现交接，不执行task complete，不声称发布或安装。

收尾只读机械核旧T1314索引515项：0字节/SHA差异（`runtime/FROZEN_T1314_READONLY_CHECK.json`）。当前共享树类型失败已交Root转所属任务，不能写为全绿；本实施等待独立评审与完整新包公共GREEN，不执行task complete。
