# T1153 校正画幅旅程把路由播报器当业务错误

当前T1152校准后真实Chrome78.928558秒exit1，首例完整PASS；第二例已真实模式拒绝、原引用保留，但getByRole(alert)同时命中业务错误和Next空路由播报器，strict mode violation。原trace与error-context确认两元素及中文业务提示“原参考图已保留”，七受测文件前后不变。不得冒称产品没有提示或改产品洗绿。

大白话：网页有业务提醒和给读屏器用的路由播报，验收需要明确读取画布内的业务提醒。

```mermaid
flowchart LR
 A[通用alert定位命中两项] --> B[限定实际main业务区域]
 B --> C[保原中文提醒和引用断言]
 C --> D[原两条公开旅程复验]
```

仅修改T1149新E2E这一个locator为实际main里的alert；不first、force、不删除提醒文本/精确引用/版本/保存/刷新/返回断言、不改产品/Next、原120秒和0retry不变。原FAIL、首例PASS、六图、trace另存。实际复验通过才关闭。
