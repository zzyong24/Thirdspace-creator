# 一次公共提交与回读

2026-10-11 03:33:24 UTC，按T1212/T1214既有验收授权执行一次scheduledJobs.runNow。提交前两次完整分页查询同job无running，真实组、账号、self.metrics与enabled均确认。唯一幂等键及旧run清单先落public-submit-intent.json。

CLI返回后，私有验收脚本用d.get('error',{}).get读取nullable error发生AttributeError，导致原提交响应没有保存。该脚本错误不是产品错误，不补造响应或requestId，且没有再次提交。随后仅公共回读发现唯一新run与AI、execution，并继续观察这三个原ID。原失败和系统自行成功86均保留。错误回读处理已用(error or {})校准；当场错误见工具输出，未伪造原HTTP回执。

未完整保存初始回执意味着不能冒签deduped字段或原requestId。公共任务的正常运行与最终结果另见public-run-observations.json。
