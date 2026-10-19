# 2d完整对账的真实结果与范围

候选`2d3826ef164241860437daa393d336d9b042f980`唯一完整reconcile实际退出1，1300.595秒，56ERROR/0WARN。原stdout/stderr私有0600，路径与SHA沿RECONCILE_2D_META.json。没有另跑full或修改原终态。

|身份分类|数量|实际边界|
|---|---:|---|
|原44失败身份继续存在|44|原32+7+2+3身份保留，不能据此说全部同因；4旧宽收据改为缺产物先阻断，T1294由foreign dirty改显commit后漂移|
|本次新增旧宽收据|2|T1354微信source、T1356持久组合根；登记T1366，不归旧债，旧通过原件不改|
|clean候选缺旧本地产物新增身份|8|另4个旧身份也换成缺产物消息，合计12；主树9报告/visible_copy根确在且ignored，clean树缺失，不冒业务回归或复制后重跑洗绿|
|本次新LED fire|2|057/061，原full子check输出被丢弃，首因UNKNOWN；Root只允许各门一次定位，不倒签原首因|

机械完整消息差分为+17/-5；按任务/LED身份差分为+12/0。二者口径不同。T1294既有身份在当前persistence有本轮追加交叉，具体路径单列RECONCILE_WIDE_RECEIPT_PATHS.json。

057后验重现exit101/6.038秒，Tauri build.rs444缺generated sidecar，未进入Windows tests；061后验当前已见contract23PASS、worker123PASS/1FAIL为Sharp0.32 native缺失，其余批已自然完成：backend72、frontend132+28；连同contract23和worker123共378PASS/1FAIL，原脚本exit1/104.955秒，原guard/config/两memory JSON SHA还原，候选最终clean。原full火与后续具体环境事实分证，不能倒填。无managed依赖修补/补binary/重试full；Root的独立T7交付依赖闭包另有实际证明，不能抹原56。

六类旧页面/组件/样式/查询合同tree对e676不变，适用旧frontend36/pagecache4/backendHost30及worker168按真实证据引用，不据此重标签旧UI执行源或声称所有历史族全程重验。新T1364/T1365没有本轮直接receipt错误，但原global依然未通过。

原full结束后生成stats已私有保存并恢复候选提交字节；随后LED061在途t1073内存观测由其原finally还原，原finally已自然还原并由SHA证实，最终候选clean；未抢写。foreign9/T1255主树原字节继续保护。T1364仍进行中等待真实诊断，T1365虽已登记启动，构建仍等Root裁定。

## Root工程裁定

Root亲读原56分类、LED057实际exit101/缺generated externalBin、LED061实际exit1/104.955秒/378PASS1依赖FAIL及四旧输入SHA恢复后，接受新能力受控门/独审与独立T7交付闭包的真实native验证，放行唯一delivery对exact2d固定产包、核产物后安全安装。此为有界交付裁定，不是完整reconcile通过，也不倒填原full两个fire首因；managed不补依赖/不补binary/不再验证洗绿。T1364仍待Root放行真实一次诊断，不能complete；T1365待实际交付回执。本次后续提交只文书，交付source仍2d，T1359旧安装e676身份保留。
