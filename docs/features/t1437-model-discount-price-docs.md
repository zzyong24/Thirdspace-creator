# T-1437 更新飞书支持模型、折扣与折后价格

2026-11-03用户指出模型与价格说明仍旧，要求按当前已替换模型及此前折扣标注折扣和折后价。源为Growth当前配置/积分充值页，必要时核对实际中转公开目录。只更新原两篇飞书文档；本任务不擅改Growth生产计费、钱包、兑换、模型Key或调用模型。

## 范围与输入
文本型号：claude-haiku-5-5、gemini-3.8-flash、gpt-6.1-sol、kimi-k3、minimax-m3、deepseek-v4.1-flash；图片编辑openai/gpt-image-2-edit。用户本轮已明确确认45折/42折/65折分别为4.5/4.2/6.5折；DeepSeek为6折，Image 2没有折扣，不调整其现价。不得沿用旧型号单价、混币种、隐藏阶梯或把展示折后价冒称已验证账单。

## 验收
来源、时间、币种、每百万token/张/秒单位明确；阶梯/缓存等规格保留；折后值用十进制定点计算并检查。用户未确认的折扣不发布为确定价格。外部文档局部修改、回读，原附件及图片token保留；不改已交付安装包。

## 边界
仅本SPEC、docs/verification/t1437/**和本任务控制面BACKLOG/PROJECT/modules/progress/context/events。Growth只读。
