# Growth 官方模型诊断独立事实复核

结论：已核 `RESULT.md`、原始预算/版本回执、T249 历史标签、实际执行脚本及补充源码片段，未发现未闭合的事实矛盾。原同机权益的供应商预算接近耗尽已有实时证据；**当前客户端与该权益的直接关联、该次 402 的供应商具体原因仍未证明，官方对话未通过。** 本报告不是推送许可。

- 四个标签分别与 T249 `MAC_AUTO_START_FINAL_POST.json` 原脱敏基准、此次 historical-target-tags 和返回的 credential/provider/encrypted-token/wallet 精确一致。冻结 collector 在三个 credential 标签非唯一或同 credential 的 wallet 标签非唯一时立即失败，完整结果仅在两处唯一守卫通过后返回。标签证明原记录一致性，不能代替当前客户端身份关联。
- 用 Decimal 重算：`4.99427733 + 0 + 0.00572267 = 5.00000000`；已用 `99.8855466%`，剩余 `0.572267` 分。Growth 保存快照仍为已用0/剩余5，last_usage_refreshed_at 是 `2026-08-19T08:54:10.577321Z`；此次账户检查时间是 `2026-10-25T15:38:23.854640Z`。表中北京时间和数量级正确。这是不同时间的快照，不能把旧快照或 ready 状态当当前可用5元。
- 账户回执的 collector/host SHA 与上轮已审脚本精确一致；版本/账户回执的 release、PID 和三个线上源码 SHA 相同，sameApiPidAfter=true。脚本显式只读事务、验证 read-only、finally rollback，回执 readOnlyTransaction=true；供应商记录恰为一次登录 POST 和一次名单 GET，均200。所审路径无生成、Key 创建/reveal/修改、预算调整或缓存写入；正常认证产生会话不等于资金写入。该结论针对本次取证路径，不声称全服务器没有其他活动。
- 初读发现 existing_only 生产分支未在版本回执中留存，且本地 Growth service.py 与生产 SHA 不同，因此没有用本地实现代签线上。补充 `usage-snapshot-paths.json` 绑定生产 SHA `eb18bca91f1b57db19d7ccab8d2b1f3ef5bfd64361831fe80aaabc99878b0425` 的2290–2337行后，已核该分支在快照缺失/至少15秒旧时调用 get_budget，只更新本次 response.wallet.availableUnits，并在 ORM 缓存/渠道/时间写入前 return。旧 DB 读数不能证明配置拉取未查询供应商。
- Creator 对应286–329行与本地文件及已安装候选 b4e174a84 的 Git 字节一致：明确 `existingOnly=1`，正常保存凭据；钱包金额/referenceId 仅用于当次服务端验证，不保存或返回 Web，留下账户状态。因此“账户已连接”不能代证余额充足。所审是这条配置拉取路径，不扩写为所有额度入口行为。
- Growth T137 §3.3 明确 remainingUnits 为 wallet 减已用及 ASR committed/reserved；生产 `_account_payload` / `_managed_credential_response` 与此口径一致。本次 provider 冻结为0，不足把“未扣冻结”认作此次故障或代码缺陷。

RESULT 正确将实时原 Key 近乎耗尽列为原因候选，并保留当前关联未知、未获该次供应商拒绝正文/预占公式/账单、不能保证充值恢复等限制。128 最小回复和8192拒绝不是正式三轮通过，也不能把 Codex 引擎成功当官方 API 恢复。没有发现应以改预算、重发额度或新建 Key 消除失败的依据。

本次复核仅读取已产生工件与源码，未访问生产、供应商或本地用户私有运行态，未执行查询/测试/模型请求，未修改产品、控制面或配置；仅新写本报告。

补充复核：RESULT 新增 `usage-snapshot-paths.json` 条目及“本轮验证”段；机械移除这两处后，字节 SHA 精确恢复为上一版 `c6f23827c96bfe662587c96c7eece89d04f87d7c92ff9bf1eccfb80885abeab8`，主事实未改。`pmem-sync.txt` 明确记录 sync 完成；`reconcile-quick.txt` 记录 quick/read-only 控制检查完成23项、13项 warning，无 error 报告，并明确 full 未运行、项目 lesson 等执行检查跳过。RESULT 保留最初裸 pmem / 不存在的 --quick 参数失败说明，没有将其改写为通过；AST/diff 及早期失败沿主线程原执行记录，本次未重跑或另行证明。此补充不改变官方对话未通过与不能推送的结论。

## 证据绑定

| 文件（本目录相对路径） | SHA-256 |
|---|---|
| `RESULT.md` | `9a4f57feff13b524200cc4de68c06dc7cc9cbc48a8347e104cc93a2d7a5bc3a7` |
| `production-account-budget.json` | `61ef7bf9c108f6c789106b41b6af1d2ea082af61c7bdfb9ad1b3dbc588dd434d` |
| `production-version.json` | `93b5057b4178e7bdb612e1eaada659307ad8c516679f3c33cd0c1fbb01df33d0` |
| `historical-target-tags.json` | `7f2bade46147ff758d8874f9d2539b34edb939fdabc0509cb64ea9b614b80085` |
| `usage-snapshot-paths.json` | `fd41ca73b5d6404f2184eee0714c8b830d2123418fd12ee4648d1825ff060c45` |
| `collect-account-readonly.py` | `f59e24df08fb98f9cf9fcc93c0af853fb30d7a590aa72567781713fd83d1e57d` |
| `remote-host-readonly.py` | `576b1fc233c66197265965702d0ec524a0c4a395c232e9c83a7d92905065985d` |
| `pmem-sync.txt` | `e96aec29c6479f4b1f7712ecebae6f941b12cc591997df24593973e1e0969eee` |
| `reconcile-quick.txt` | `1f5e5d62ba0bed311b0af40aaf5b62d5e22d35cc8fe17a15be0d29417cec4ff0` |

T249 原基准 SHA-256：`8259cde7b0197a052f3aebf3e29220644d33c42f5c103a685e35db5e0de8b172`。Creator 配置拉取源码 SHA-256：`2d77cc04c99d2be1cfa12bb5c5b7e2a3d1b4b51050bd33e5607c6510ea1bbf1c`。
