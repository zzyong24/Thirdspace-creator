# T-1255 Activity 限定修改说明

## 必要性

主线 Activity 当前没有 Creator Reports 专用签发与动态核验接口。CreatorOS 只能证明本机用户确认，Growth 只能管理接收方数据；两者不能代替 Activity 证明真实激活机器、产品/渠道归属、过期/撤销/换绑及历史删除主体。旧 feedback/config 票据 scope 不授予报告写入；冒用它们会破坏已评审信任边界。

复用已有隔离候选 `1b1c473b66909c3d4df68e8f1556c39446d3f9d8`；只移植专用增量并按当前依赖复核，不覆盖主线其它未提交文件。

## 本次请求批准的准确范围

仓库 `/Users/zyongzhu/Workbase/Thirdspace-activity`，仅以下文件：

- `SERVICE_CONTRACT.md`：追加专用上下文与共享 fixture 版本引用。
- `src/app/api/license/creator-report-context/route.ts`：新增 `POST /api/license/creator-report-context`。
- `src/app/api/integrations/growth/v1/creator-report-context-introspections/route.ts`：新增 Growth HMAC 认证的专用核验接口。
- `src/lib/creator-report-context.ts`：复用既有激活查询/签名，签发五分钟、限产品/渠道/安装/scope能力；加密内部标识、按激活单元隔离删除主体。
- `src/lib/creator-report-context-route-handlers.ts`：closed schema、体积限制、核验和原幂等审计端口。
- `tests/creator-report-context-contract.test.ts`：保留原安全场景并补共享 fixture、当前主线兼容和真实协议验证。
- 新增 `docs/contracts/creator-report-context-v1.fixture.json`：三仓 exact claim/request/response/error 测试向量；测试密钥全部一次性，非生产凭据。

允许本机隔离测试的临时运行配置读取：`CREATOR_REPORT_SUBJECT_KEYRING`、已有 `LICENSE_SIGNING_PRIVATE_KEY` / `LICENSE_SIGNING_KEY_ID`、`GROWTH_INTEGRATION_KEYS_JSON`。仅测试进程 env 与隔离数据库，不写用户 `.env`、实际密钥或现有运行配置。

无 Prisma schema/迁移/依赖改动，无现有激活、反馈、配置票据接口变更。本次不包含部署、推送、重启真实服务、生产数据库/码写入或实际运行环境配置；上线时对准备好的具体版本另核发布授权。

## 用户影响、兼容与恢复

授权后本地开发可完成三仓真实 HTTP 验收；现有用户激活、续期、反馈和配置下载沿原接口运行。风险集中在历史候选与当前激活 helper 的兼容、专用主体 key 轮换和删除核验；以现有原回归和新公共链测试覆盖，不假称已通过。

回滚撤去两新增路由及专用服务/合同/测试增量即可恢复原本无报告能力状态，原接口与 schema 不变；测试数据库和一次性 key 完成后销毁。若日后已上线并接收数据，必须先停止新发送、保留删除处理能力到既有授权数据清理完成，不能直接切断用户删除。

## 确认

确认允许修改 Activity 上述范围吗？

此问来自 Activity 当前 `AGENTS.md` 的 LOCKED_MAINTENANCE：“未获得用户针对本次具体改动的明确确认前，禁止修改 Activity …”；“历史授权、宽泛授权 … 不构成授权”。它只限制 Activity；CreatorOS、Growth 的可逆实现准备继续。
