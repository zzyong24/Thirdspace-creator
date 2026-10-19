# T1364 worker 实现与受控验证

2026-10-19；仅隔离合成页面/临时证据根/真实 Chromium，不连接实际微信、不读正式profile/凭据/用户库、不打包。worker唯一写集为下列4文件；BACKLOG、中央事件及backend/contract均由各自owner维护。本记录不宣称原281/1499/1502已恢复，也不代签backend真实DB租约、canonical HTTP或未来安装。

## 已冻结字节

|文件|SHA256|
|---|---|
|`ai-worker/src/runtime/platform/wechat-browser-source.ts`|`9ff3df234a0d1ebcba77a46252ca40695af507fbc750bf6fe5cb91c2c7b00c24`|
|`ai-worker/src/runtime/platform/wechat-navigation-observation.ts`|`4a18d3d03d6964dd28f97fd7cf0686fe9cfa47a08ad2c19d520c1080e300a88c`|
|`ai-worker/src/runtime/platform/wechat-navigation-observation.test.ts`|`59594c86f234bbc83a1e85c054e958e7cdf0e61c88cfe43f940e3dcbd3121cfe`|
|`ai-worker/src/runtime/platform/wechat-browser-source.test.ts`|`bd922ef88caac9b0a11f4058f184e03b6908d7202da9adbf1960908132967e9a`|

## 实现边界

source新增固定视频号`observeNavigation`，复用同Page/identity witness、guardedLaunch、原绝对deadline和原停止释放口。scope在guard排队后/SDK尝试前、第一次goto前、identity读取前、采样/截图前后复核。仅新诊断使用有限close等待，最多120秒且受原绝对end剩余裁剪；未实停不自行释放，挂起保pending及原retry能力。原collect/login/readIdentity保持原关闭行为。

只保存初帧及120秒窗口末帧的最多两张viewport PNG；私有目录0700、PNG0600、固定/tmp受信根、拒绝symlink/越根，使用临时wx写入与原子完成；只有opaque artifactId/SHA返回。scope失效、取消或晚截图不提交图索引，已生成的本次未发布图清除。

最多32份私有样本实际保存在Result.samples，包含时间、固定route分类、root计数/可见性及遮挡汇总；中间样本不重复菜单文字。必要菜单候选文字只留两snapshot，每帧最多128项×80字符。机械结构区分顶层/同源Frame/跨域Frame/open或不可读Shadow/隐藏/遮挡/菜单变化/无标准导航容器UNKNOWN；不保存全DOM、body、URL/query/href、请求响应或Cookie。Frame按祖先先访并传播祖先视觉可见性。

## 当场证据

- `RED.txt`：实现前，source方法不存在的真实失败及新模块缺失。它只证新诊断能力缺失；完整公共RED另由backend owner保存在`backend-public/RED_PUBLIC_02.log`，不冒充真实平台selector根因。
- `FINAL_WORKER_ALL_05.txt`：最终4文件，**168 PASS、0 FAIL、retry=0**，包含source86、新结构18、原T1363入口27与原witness37；134.13秒真实结束。命令见下。
- `TYPES_FROZEN_04.txt`：`pnpm exec tsc --noEmit --pretty false` 实际退出0，日志为空；最终4文件`git diff --check`退出0。
- 真Chromium成功例实际观察至少120000ms，初末两张PNG做SHA、0600与Chromium `Image.decode`/canvas像素读取，尺寸1440×900；0 prepare、0 download。guard实际context关闭后，再触发注入释放回调。真实DB lease结果属于backend公共组合证据，不能由该回调夹具代签。
- `TRANSIENT_SEQUENCE_01.txt`：受控时钟，初末entryVisible均0，但私有samples保留中间1；不是第二次实际平台运行。
- `LATE_FRAME_CANCEL_01.txt`：Frame卸载和截图promise晚到于取消，两例PASS；无晚PNG/晚结果，真实context关闭。
- `NESTED_FRAME_RED_01.txt`：最初display:none疑点真实反证PASS，文件名不使它成为红测。`NESTED_FRAME_RED_02.txt`保visibility:hidden/opacity:0两例真实FAIL；窄修后`NESTED_FRAME_GREEN_03.txt`13相关例PASS，并全部纳入最终168。
- 首轮真实观察在macOS tmpdir而非受信/tmp导致图片missing；第二轮已生成两图但Sharp缺原生依赖，均保留原FAIL（`GREEN_T1364_01.txt`、`GREEN_WORKER_02.txt`）。后续使用受信/tmp和浏览器原生图片解码，未放宽断言或改产品安全限制。

最终命令（cwd=`ai-worker/`）：

```bash
pnpm exec vitest run src/runtime/platform/wechat-navigation-observation.test.ts src/runtime/platform/wechat-browser-source.test.ts src/runtime/platform/wechat-dom-witness.test.ts src/runtime/platform/wechat-channels-entry.integration.test.ts --retry=0 --testTimeout=2700000 --hookTimeout=120000
pnpm exec tsc --noEmit --pretty false
```

后续由backend owner完成最新helper字节上的canonical CLI/真实HTTP断连、实际DB lease读回及全局适用门，独立实现评审仍独立进行。worker无待修已知失败；不能据此提前执行真实导航或修改已安装App。
