# T1154 核对原生画幅选项被禁用断言读取成父控件

T1153 当前 Chrome 在 2026-10-09 18:50:09 UTC 结束，173.592504 秒 exit1，首例完整 PASS；第二例 main 内模式拒绝提醒通过，但 `option[value="1:1"]` 的 toBeDisabled 观察120秒失败。原日志240次明确显示 `<option disabled value="1:1">`，不能据此猜产品允许选择。七个受测文件前后SHA不变。

大白话：选项被禁用和整个下拉框被禁用是两个状态；测试必须读取原生选项本身，保留用户不能选到不支持画幅的要求。

```mermaid
flowchart LR
 A[保留实际失败及原HTML] --> B[核对安装版Playwright真实消费代码]
 B --> C[同构最小原生控件核对]
 C --> D[仅校准观察并复验完整公开旅程]
```

当前安装 Playwright 1.60.0 的 `coreBundle.js` 包含实际 `elementState` 和 `retarget` 实现；先核对是否 follow-label 将 option 转为父 label.control，再用同结构独立 Chrome 做有界区分性观察。若确认此机制，仅把 T1149 新 E2E 的这一处观察改为原生 option.disabled 属性与 disabled 属性的有限等待断言；其余业务、引用、版本、保存、刷新返回及120秒/0retry保持。若最小观察不支持此判断，停止猜测并补实际产品SPEC。不得改产品、删断言、force、把原FAIL改PASS；不调用模型、不触碰用户数据。

原失败日志、JSON、源测试、六截图和完整trace保存至私有 `t1154-option-first-browser`；原 trace 不进入Git。只有同构观察及原两条公开Chrome旅程实际通过才能关闭本诊断，T1149完整验收另行处理。

## 实际定位与校准

安装版 `coreBundle.js` 的 elementState 先用 follow-label retarget；option 不在无需跟随的控件列表，外层label.control返回select；getAriaDisabled自身虽支持OPTION，但本例到它时已经是enabled select。独立Chrome同结构实际输出 nativeDisabled=true、hasDisabledAttribute=true、parentSelectDisabled=false、matcherDisabled=false，原属性和属性断言已通过，确定性消费代码与当前真实失败HTML吻合。

两个独立探针随后附带的Home/ArrowUp键盘选择观察均保留实际120秒失败及exit1：值仍16:9。没有把它们签成整条探针PASS，也不声称已经验证原生下拉键盘菜单；该附带操作不作为禁用属性或产品缺陷的归因。本次不再盲试键盘动作。只校准原E2E这一处为option原生disabled属性和属性存在的120秒断言，两模式拒绝与引用保留断言原样保留，完整公开旅程结果仍待实际发生。
