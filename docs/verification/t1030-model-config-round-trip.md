# T-1030 模型备份往返实测

2026-10-01，隔离验收库。未修改用户安装版数据库、模型配置或原作品。

## 当场发现与修复

实际桌面配置的导出文件共 12 行：4 条已配置模型与 8 条沿用默认模型的空字符串占位。原导入器拒绝首条占位，错误为 `models[0] 缺必填字段(capability/provider/modelName)`。

修复只让实际存在且为字符串的 provider/modelName 接受空字符串；capability 仍须非空。数组行、字段缺失、错误类型继续全文件拒绝。没有改变加密或默认模型解析策略。

## 真实证据

- 修复前 `model-config-transfer.test.ts`：13 测试，1 失败、12 通过。失败为合法继承占位往返，错误落在原 parser 的必填判断。
- 修复后 `pnpm --dir backend exec vitest run src/modules/settings/model-config-transfer.test.ts src/modules/ai-runtime/llm/resolve.test.ts`：2 文件、28 测试通过。
- 补充 T-1029 稿件快照回归后合跑上述两文件与 `src/application/generation/creative-post.test.ts`：3 文件、34 测试通过。
- 从运行中的安装版公开读取模型元数据：12 行，default、image.generate、video.generate、transcribe.audio 的 hasSecret 为 true。隔离复制只用于读取模型配置，其读回元数据与公开读取一致；不把运行中复制宣称为完整一致性备份。
- 相同机器密钥仅在服务端解包后导入 `/tmp/creatoros-t1029-acceptance-db`：12 imported / 12 total / 0 failed；4 条密钥导入，8 条保留既有空凭据语义。报告无密钥明文。
- 使用真正的 `resolveLlmConfig` 验证 copy.generate 的空占位仍回退默认配置；同时验证备份再次导出元数据一致且不含明文凭据。

SPEC 独立只读评审 PASS，回执 `REV:db00158719fb`。全局 reconcile 与客户端生成验收另按当前当场结果记录，不能据此认定整个客户端已验收。

任务验收列使用 —：本任务无前端新表面，SPEC要求的是后端配置往返测试；实际配置导入和后续真实模型均有上文记录，未把它伪装成桌面UI验收报告。
