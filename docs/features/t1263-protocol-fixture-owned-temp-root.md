# T-1263 修复协议验收替身与隔离临时根的归属校验冲突

这是用户已授权的T1246全功能验收在db4669包上的新故障叶任务，不重置T1261或T1246已有审核，不改变产品执行引擎、账号组归属、模型配置、费用或App授权。用户要求先记录问题、集中修复、重新打包及子Agent浏览器复验；本叶仅修协议测试工具，产品代码不在写集。

## 当场事实

当前protocol nonce `4f28b9514e6ab6a5fff118ab` 前五项真实FAIL：原提交按钮disabled并显示本地Codex不可用，原120秒点击观察耗尽，taskIds为空，未进入同thread读回或工程往返分支。原公开 `/api/chat/engines` 状态installed=true、available=false、version=0.159.3、errorCode=CODEX_PROCESS_EXITED。测试替身--version先成功返回；app-server分支以realpath(os.tmpdir())作为runtimeRoot前缀。R3 launcher将Next/worker TMPDIR设为该runtimeRoot/owned-data/tmp，正式backend/worker保留此值，因此前缀条件确定冲突。原RPC stderr被消费但未记录，缺当场异常栈；不补造栈，也不把fixture故障视为真实官方Codex不可用。当前全部七例仍必须完成原body及实际闭合/账本，完整原FAIL保留。

Pi的独立loopback HTTP替身没有上述目录守卫；不扩大本任务到Pi产品或配置，也不称Pi已验。真实官方模型103提前exit1及三个UNKNOWN分别诊断，不由此工具修复代签。

## 精确范围

只允许在已冻结工作树全部当前profile真实闭合后应用：`docs/verification/t1246/round-3/new-v3/source/fixtures/codex-protocol.cjs`（原替身SOURCE SHA `c210`前缀；完整绑定见本轮精确诊断），及相邻本叶验证测试/报告；所依据的正式launcher、backend传递、worker环境源保持原字节。不得改用户HOME/CODEX_HOME，不读取凭据，不替换官方SDK，不改runtime入口预算，不删除临时根归属限制。源路径已实核并须以原运行替身完整SHA pin绑定；不允许修改其余fixture或生产路径。

修复须验证持有的marker与runtimeRoot：绝对路径、realpath、同UID、普通文件/目录、实际protocol前缀与同nonce/profile归属；TMPDIR若为隔离根须严格等于该root/owned-data/tmp，不能用宽泛startsWith或移除所有检查代替。其他有效已确认原调用环境应按实际consumer核对并保留，不能让合法公共链因新校验失效。对错误root、symlink、错profile/nonce、外部TMPDIR等族必须拒绝；不得访问或清理用户目录。语义不由目录规则判断，规则仅验证测试夹具归属。

## 验收

先运行原未修守卫在当场runtimeRoot/隔离TMPDIR输入上的真实RED，保原输出；独立评审后实施，再测所有合法与拒绝族。这不是补拍历史TDD。随后固定精确源码、沿原launcher重新执行独立nonce完整protocol7，真实握手四ID/同thread读取/错误族与取消/归属断言、原120秒以上预算及retry0保持；至少实际公共 `/api/chat/engines` 可用、真实提交/恢复分支、截图与原账本/资源闭合均有证据。7/7未实际跑过不签通过。Pi1、Doocs2和全功能总验由T1246继续，各分母独立。

测试工具变更不能声称原DMG包含新生产修复；有后续产品变更时必须生成新干净source开发包并完整复验。全局既有债、缺原素材六项用户获准跳过、官方103未入场与App未验保持独立。按正式taskctl/pmem/reconcile收尾，不手改完成状态。

```mermaid
flowchart LR
 A[原协议失败与目录条件冲突] --> B[窄范围独立评审]
 B --> C[闭合原运行并保FAIL]
 C --> D[修夹具归属校验]
 D --> E[原启动链完整七项重验和截图]
 E --> F[同ID账本及资源闭合]
```

实际证据：`/private/tmp/t1261-protocol-tmpdir-readonly-xuh3fzmd/PROTOCOL_OWNED_TMP_PREFIX_READONLY_DIAGNOSIS.json` SHA `2ac54f0a254b30a8dac261bbc62a7572a813a2de1a78118f74130a75ae981863`，含原guard表达式与真实隔离输入纯求值reject、两条原状态响应及Pi不同路径。该纯求值不是新SDK执行或当场异常栈。
