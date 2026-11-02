# Windows prepared closure 衔接复核

实际 RED：run41484713756 下载的 setup.exe 经7zz提取真实tar并流式枚举，共1744124条目，1739717在node_modules下；与既有T675合同矛盾。`production-closure-artifact-red.log` 是实际制品断言失败，不冒称未运行的新源码行为红测。旧流水线原生终态与原始日志另保留；API step success 不能替代日志。

独立前审、后审：review_ci_signing，无阻塞。范围保留Windows已准备的少文件闭包，正式CSP/Growth配置从源构建一致传播；完整复制/CLI/结构检查后标注clean字节身份与runtimeKind。官方Windows入口先核来源/字节/资源/零node_modules与链接，保verdict公钥核对、最终tar、固定根104B签名。Mac/普通与已签capsule不被新选择器改变；禁止混淆/字节码/诱饵。真实安装后HTTP只记录CSP作为独立证据，不新增quality hard-fail。

本机回归：六组123测试通过；production closure公共构建计划及原Git迁移资产身份17测试通过；timeout-policy/verify.mjs exit0。公共准备→package→最终tar的Windows全链及真实HTTP CSP仍由下一轮原生CI证明，不能用本机helper/源码检查替代。
