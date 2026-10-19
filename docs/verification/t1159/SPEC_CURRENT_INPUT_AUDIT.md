# T1159 正式当前输入：补充独立字节审计

- 审计时间：2026-10-10T03:54:50+08:00
- 实读 HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- 当前正式 SPEC SHA-256：`b95d6954c52e5251f3b4b430ae6af2fb6e4a571c3839e0f9230ee33abae59073`
- 当前 modules 全文件 SHA-256：`1327fc25b81acb4d978805c75604e21bd6bc7628f11725ccf264c94b5b4018af`
- PAGE_SPEC SHA-256：`4f003ececceea68aa7cb89ed5eac12e4e20acde2d01398edd407bdff900f0a37`
- SOURCE_MANIFEST SHA-256：`ce24cfa9ef39fa568a4d395638a572e319f49724aaa27675c89df95f7ac2f83a`
- 产品定位 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`

## 审计性质

这是正式 reviewctl 已记录之后，对实际当前输入字节的补充独立审核。它不倒签或替换旧私有 `db8cf…` 报告，也不改写正式 receipt 的发生时间。

## 结论

**PASS（当前输入与原独评边界一致）。** 当前 `b95d…` SPEC 相对早期私有读取已把新增 contract 测试纠正为真实 Vitest 目录 `contract/tests/current-wechat-integration.test.ts`；modules 的 T1159 write_set 与命令使用同一路径。该测试与 registry/native-report contract 一起执行，避免把不存在的 `contract/src/resources/...test.ts` 当验证。

当前 SPEC 还明确了 21 个来源测试的分类：`ai-worker/smoke/t1110-native-report-private-files.ts` 是读取原用户实文件的辅助入口，仅保留来源代码，不执行、不传给 Vitest；其余 20 个原测试全部绑定在 contract/backend/worker/frontend 命令。该限制避免把缺少私有文件误报为产品 RED，也避免在研究暂停期间读取用户实文件。

T1159 模块同时包含完整 LED-047 八文件命令，以及四端类型、worker build、新报告 Chrome、T1101/T1136/T1140 旧旅程、timeout、boundary/semantic/orphan、diff、pmem 与 reconcile。SOURCE_MANIFEST 仍为 56 路径（33产品、21测试、2包；18条当前main不存在），冻结来源 293d 的逐项 blob SHA 与清单一致；PAGE_SPEC 的7个 watched paths、三视口及 refresh/repeat/back 未变化。

所有原安全结论保持：0131只追加、0130不动；owner/lease/generation/转组与旧历史不放宽；手工未验证微信账号的隔离 Chrome 只能读真实0并以 SCOPE_MISSING 拒绝同步且零run/浏览器/下载；研究family两次实验已耗尽、真人执行及真实profile安装继续暂停；AC-LIVE、T1148最终旧收据、安装与全局Gate均未通过。

当前 modules 全文件 SHA 已因 T1161/T1162 等控制登记继续变化；本报告核的是其中当前 T1159 条目的上述路径与命令，不把其它任务的控制变化算作 T1159 产品证据。
