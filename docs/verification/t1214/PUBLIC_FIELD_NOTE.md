# 公开字段的观察边界

public-ai-first.json对选定字段使用dict.get，未暴露的accountId/finishedAt/createdAt记为null，仅表示本观察没有取得该字段，不证明AI底层这些列为NULL。原调用公开键列表确实没有这些字段；真实平台account以同job公开记录和public-final-execution.json为据，两者均为acct-ae1a8346-9。同run/AI/execution关联与终态另有实际回读，不改变归属校验。
