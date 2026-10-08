# T1087 FD EOF 修复独立实现复核

- 复核时间（UTC）：`2026-10-08T16:40:01.792833+00:00`
- 结论：**PASS_IMPLEMENTATION_CURRENT**
- 范围：仅 `secret-crypto.ts`、原单测和新增真实 FD integration；不代签新安装包或用户实际密钥。

## 结论

最终生产变化准确区分了 `readSync` 的三种结果：`EAGAIN` 在尚未读到数据时仍按原 `executionTimeoutMs()` 预算每 10ms 等待；读到主体后的 `EAGAIN` 结束本次 key；`n === 0` 作为真实 EOF 立即退出并进入原 env→file→dev fallback。它没有缩短或删除 120 秒执行预算，没有改变 fd→env→file→dev 的安全优先级，也没有缓存空结果。

本次修复只把旧错误逻辑“EOF 当暂未就绪并睡满预算”改为 POSIX/Node 的 EOF 语义。合法非空 fd key 仍按 fd 缓存；空、非法、过长、EBADF 都不进入 fd cache，并沿原后备路径。加密、GCM、文件反混淆、环境变量兼容和用户密钥存储路径均未改变。

## 源码审查

- `readMasterKeyFromFd` 在 cache 命中后直接返回；Windows 原短路保持。
- 循环 deadline 仍为 `Date.now() + executionTimeoutMs()`，EAGAIN 未读到数据时继续 `sleepSyncMs(10)`；不存在把原两分钟预算降成短超时的变化。
- `n === 0` 直接 break；随后仅 `if (key) fdKeyCache.set(fd,key)`，因此 EOF/空白/非法最终不会把空串写入 cache。Windows 的既有空 cache 是原独立平台策略，未由本任务改变。
- `resolveMasterKey` 顺序仍为合法 fd、合法 env、真实 `.master-key` file、随机进程级 dev fallback。任何 malformed fd key 都不能压过合法 env/file。
- 生产代码没有输出 key 或 plaintext；新增真实测试只在隔离子进程生成合成 key，父进程只读取布尔/计数，且断言 stdout+stderr 不含合成 base64 key和明文。

## 测量可信度与测试边界

最终 integration runner 在导入被测模块前替换 `fs.readSync` 并调用 `syncBuiltinESMExports()`，使生产文件的 named import 走被观测函数。`measuring=true` 只包住实际 `resolveMasterKey` 同步段；`readSync` 仅在 `args[0]===observedFd` 时计数，`Atomics.wait` 也只在该段计数。因此 tsx/module loader 自己的文件读取或等待不再污染 EOF/sleep 数字。

真实输入族覆盖：closed pipe EOF→env、closed pipe EOF→file、换行与数据后 EOF 的 fd 正常注入及正 cache、非阻塞 FIFO EAGAIN 迟到写、第二独立 query module 从耗尽 fd 转同源 file、仅换行/空白/非法短值/过长值、EBADF。测试 finally 清 timer、writer FD、child 和临时目录；生产测试中的 regular-file EOF fixture也关闭 FD 并删除目录。

## 实际证据

- 有效旧源码 RED：`t1087-fd-red-valid-reader.log`，exit1，120.39s，真实 EOF 被读 8863 次并 sleep 8863 次；它是本次 TDD RED。
- 首次 `t1087-fd-red.log` 是生成脚本字符串转义错误，按要求仅保留历史，**不计 TDD RED**。
- GREEN first 真实 exit1、35 PASS/3 FAIL；它暴露计数污染与缺少合成 machine/file seed，已保留，不冒充成功。
- GREEN second：2 files、38/38 PASS、retry 0、无文件并行，exit0，3.552s；包含上述完整 FD 输入族。
- 消费者回归现已实际结束：settings/identity crypto 2 files、11/11 PASS、retry 0、exit0，24.03s。

## SHA256 绑定

- `backend/src/secret-crypto.ts`: `6e55797dcf01cb79c803b7abd95ad2d7bd3051bf36f3512603b0b629f404e225`
- `backend/src/secret-crypto.test.ts`: `3a920c19dacde960ce65d4395c9f6074ae0b7ac3a8dfd30f381829348c53eef8`
- `backend/src/secret-crypto.fd.integration.test.ts`: `f7dc6f40f5d42bbd48b3846022d83f940fb1dbbb382b8b4495768c1e57846270`

- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084/t1087-fd-red.log`: `98aadc696560d94557e595b18f1842be5f0418118e8fb6b2bea6f252cf73cc7e`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084/t1087-fd-red-valid-reader.log`: `a2679071e46b9f73ea5ccf20db76b67a433bd01b00c8b07e7a3570ab9b6b02bc`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084/t1087-fd-green-first.log`: `ba684894471d700fa4429f110522fcf2de829f7dd099bf5d9683418f721af227`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084/t1087-fd-green-first.json`: `4a1cb3550a0ba19bca601c4a4ad4d26b575c05060a4ee8bff0b716569920b1b0`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084/t1087-fd-green-second.log`: `8486ffc5e5cbad08cff5cdbc8d615a71abddea42f2d69a5f7bf406a2e94de4c3`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084/t1087-fd-green-second.json`: `790d76511c690018ecdb0112a58cf939189706540ca284f905a586fd6defffa2`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084/t1087-crypto-consumer.log`: `36981a9f27c8c2bfa69cabccc553db6b0e58c7fc430a03311f30272fb83cb630`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084/t1087-crypto-consumer.json`: `f33c556e9fc32da96b1be57bb02b71f49b4ec2dd933afcccfb98dde19ff24bc0`

## 未验证与限制

本复核没有运行产品/API、数据库、模型、App、构建或任何密钥读取；没有修改源码或测试。当前 PASS 仅覆盖所读最终字节、真实 FD 测试和已结束消费者回归。仍需 root 按正式流程核最终提交/类型与适用 Gate，并由新安装版验证真实 sidecar 的 fd/file 注入、启动可用性和原用户密文可解；在这些发生前不得写成安装版已修复。
