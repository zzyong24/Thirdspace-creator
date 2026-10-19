# 同原普通聊天的只读时间拆解

原唯一聊天未重发，四次原ID公开GET补证。点击至HTTP发出约7.4毫秒、响应头约204.9毫秒；AI记录至execution记录16毫秒，execution记录至唯一原生账本call记录2.194秒，call记录至settled15.729秒，settled至SSE文字约54.3毫秒，SSE文字至可见正文16.6毫秒。

这些是公开记录墙钟区间，不能精确拆成排队、启动、账号预检与模型等待。现worker先保留账本call，再创建controlled session，因此15.729秒内可混合这些步骤；AI startedAt=null、steps=[]，公开接口没有更细时间。总usage37841未公开输入/输出/cache分量，不当prompt长度或费用。

原性能25项索引保持不变，本追加只说明能证与缺证范围，不新增模型/任务、不重开数据库。
