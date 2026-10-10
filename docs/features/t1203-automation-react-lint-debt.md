# T-1203 自动化静态检查既有欠债

T1199实际targeted eslint失败。随后用git show HEAD同文件经eslint --stdin --stdin-filename核基线，原HEAD同样存在effect同步setState、render读写ref、前置声明、memo依赖等错误。T1199新增scope依赖、setter声明和创建闭包先修，不降门、不删除切scope与卸载保护。剩余既有effect/ref相关欠债保留当前/HEAD两原日志；下一任务按真实行为合同独评后处理，不能视为当前lint PASS。
