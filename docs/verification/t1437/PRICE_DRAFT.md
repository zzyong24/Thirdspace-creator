> 历史未确认草稿，已由本轮USER_CONFIRMATION.json、PRICE_TABLE.xml与实际文档回读取代；不作为当前交付。

# 模型价格核对草稿（尚未发布）

待用户确认45折/42折/65折的准确含义及图片编辑折扣；Growth后台未登录，尚未核实客户真实账单。本表只展示按0.45/0.42/0.65/0.60假设倍率计算的公开中转目录价格，不代表已生效价格。

单位保留源币种，每百万Tokens；各行范围和缓存类型来自2026-11-03实际公开页面。

| 模型 | 计费项/范围 | 公开目录价 | 待确认倍率 | 计算值（未发布） |
|---|---|---|---|---|
| claude-haiku-5-5 | Input(0-100000) | $0.1/Mts | 0.45 | $0.045/百万Tokens |
| claude-haiku-5-5 | Input(≥100001) | $0.5/Mts | 0.45 | $0.225/百万Tokens |
| claude-haiku-5-5 | Output(0-100000) | $0.5/Mts | 0.45 | $0.225/百万Tokens |
| claude-haiku-5-5 | Output(≥100001) | $2.5/Mts | 0.45 | $1.125/百万Tokens |
| claude-haiku-5-5 | Cached reads(0-100000) | $0.01/Mts | 0.45 | $0.0045/百万Tokens |
| claude-haiku-5-5 | Cached reads(≥100001) | $0.05/Mts | 0.45 | $0.0225/百万Tokens |
| claude-haiku-5-5 | Cached Writes (5m)(0-100000) | $0.125/Mts | 0.45 | $0.05625/百万Tokens |
| claude-haiku-5-5 | Cached Writes (5m)(≥100001) | $0.625/Mts | 0.45 | $0.28125/百万Tokens |
| gemini-3.8-flash | Input | $0.75/Mts | 0.42 | $0.315/百万Tokens |
| gemini-3.8-flash | Output | $3.75/Mts | 0.42 | $1.575/百万Tokens |
| gemini-3.8-flash | Cached reads | $0.075/Mts | 0.42 | $0.0315/百万Tokens |
| gemini-3.8-flash | Cached Writes (1h) | $0.5/Mts | 0.42 | $0.21/百万Tokens |
| gpt-6.1-sol | 输入价格(0-272000) | $2/Mts | 0.42 | $0.84/百万Tokens |
| gpt-6.1-sol | 输入价格(≥272001) | $4/Mts | 0.42 | $1.68/百万Tokens |
| gpt-6.1-sol | 输出价格(0-272000) | $10/Mts | 0.42 | $4.2/百万Tokens |
| gpt-6.1-sol | 输出价格(≥272001) | $15/Mts | 0.42 | $6.3/百万Tokens |
| gpt-6.1-sol | Cached reads(0-272000) | $0.1/Mts | 0.42 | $0.042/百万Tokens |
| gpt-6.1-sol | Cached reads(≥272001) | $0.2/Mts | 0.42 | $0.084/百万Tokens |
| gpt-6.1-sol | Cached Writes (0-272000) | $2.5/Mts | 0.42 | $1.05/百万Tokens |
| gpt-6.1-sol | Cached Writes (≥272001) | $5/Mts | 0.42 | $2.1/百万Tokens |
| kimi-k3 | 输入价格 | ¥20/Mts | 0.65 | ¥13/百万Tokens |
| kimi-k3 | 输出价格 | ¥100/Mts | 0.65 | ¥65/百万Tokens |
| kimi-k3 | Cached reads | ¥2/Mts | 0.65 | ¥1.3/百万Tokens |
| minimax-m3 | 输入价格(0-512000) | ¥2.1/Mts | 0.65 | ¥1.365/百万Tokens |
| minimax-m3 | 输入价格(≥512001) | ¥4.2/Mts | 0.65 | ¥2.73/百万Tokens |
| minimax-m3 | 输出价格(0-512000) | ¥8.4/Mts | 0.65 | ¥5.46/百万Tokens |
| minimax-m3 | 输出价格(≥512001) | ¥16.8/Mts | 0.65 | ¥10.92/百万Tokens |
| minimax-m3 | Cached reads | ¥0.42/Mts | 0.65 | ¥0.273/百万Tokens |
| deepseek-v4.1-flash | Input | ¥2/Mts | 0.6 | ¥1.2/百万Tokens |
| deepseek-v4.1-flash | Output | ¥8/Mts | 0.6 | ¥4.8/百万Tokens |
| deepseek-v4.1-flash | Cached reads | ¥0.04/Mts | 0.6 | ¥0.024/百万Tokens |

图片编辑：openai/gpt-image-2-edit，公开目录只验证起步价$0.0021/张；详情服务不可用且用户未给折扣，不外推完整规格价格。

Growth本地充值页ModelPriceTable/modelPricing仍为13项旧型号与目录原价。用户最新要求折扣展示与原T-151“仅原价”不同，若要修改充值页面须以本次明确要求更新对应产品事实，不能只改文案就冒称计费已生效。
