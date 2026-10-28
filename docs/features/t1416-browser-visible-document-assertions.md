# T-1416 真实浏览器验收对齐网页可见正文

2026-10-25，沿用用户“有问题继续修复，没通过的验收处理好，复验通过后再推送”授权。本项仅修复 LED-054 中两处过时的外部页面断言，不改产品行为或验收目标。

## 已发生的原因

候选 `75b74649e43e001bf6682867c331e14308074a61` 的原 full 自然退出 1，LED-054 两例失败：实际提取有 example.com 的可见说明正文，却没有旧期望 `Example Domain`。当日公开 HTML 的这个词只在 `<title>`，body 没有原来的可见标题；原提取功能返回 accessibility snapshot 与 visible text，本来就不保证包含标签页标题。详细原两文件回归保持原源码执行，补齐 full 尾部截断的第一例失败证据。不能据此改脱敏、URL 安全规则或声称真实浏览器坏了。

## 最小变更与不变量

仅在 `frontend/src/server/workbench-browser-host.test.ts` 替换两处 `Example Domain` 文本断言：从真实返回的 `[visible text]` 区块核对精确来源 `https://example.com/`，并核对当前可见完整英文段落 `This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes.`。从区块中取值，不能靠错误说明、schema、页面标签标题或其它结果区块凑中期望。空文本、只有标题、错误来源或缺段落必须失败；不把预先抓取的 HTML 注入真实结果，不 mock navigate/extract。

保留原两文件、所有用例、五个 realTest 的执行条件、真实 Chromium / Rust / Node / DB 链、域名和请求地址、profile / account / task 隔离、取消后另一账号继续运行、租约与进程清理、全部等待预算及 retry=0。保留访问公开页面的既有网络依赖；它仍可能因站点变化或网络故障失败，本项不声称实现了稳定本地网站夹具。当前生产 URL 策略禁止端口、primary 只允许 HTTPS，不为测试放松策略、信任证书或加 CDP 注入。

精确写集：上述测试；本 SPEC、对应审核及 `docs/verification/t1416/**`；BACKLOG、modules.config、context/T-1416、progress、events、review-events，以及按已有流程生成的 PROJECT。其它源码、守卫配置、历史证据、安装产物只读。外盘正在执行的候选不修改，待原回归退出后再冻结新候选。

## 验收与证据

保留原 full 与原两文件的真实 RED；保存当日公开 HTML、来源与 SHA，说明标题和可见正文的差别。独立复核规格与最终 diff，确认没有放宽原账号/生命周期检查。修复后在相同隔离环境跑原 LED-054 整条命令，原五个 realTest 全部真实执行且 0 skip；所有分段退出与清理如实记录。运行 `git diff --check` 和 frontend typecheck；只改测试无需重复安装，安装仍绑定 f9e5e5ece，不能重标二进制提交。

T-1412 原 full 55 项只出现 LED-054 这一失败时，未变的 54 项证据可按公共证据规则引用，必须明确为“原 full 失败后单项修复复验”，不能改写成新候选一次 full PASS。如果出现其它失败则各自处理。完整推送条件仍由 T-1427 判断；本项不代签官方 Pi、图片幂等资格或安装版 UI。
