# T1295 本轮实际验证

原用户错误是正式页面script-src缺少WASM专用许可。最小源码只在script-src加入wasm-unsafe-eval；保JavaScript unsafe-eval禁止、其它全部directive/来源不变。

Root实际先应用测试，再运行原Node两文件：csp-red.log真实exit1，3失败/6通过；应用单token修复后原命令csp-green.log真实exit0，9通过。不是事后补拍RED。

浏览器原生视频内核、公共制作/导出、成片音画与打包仍在验；App原生自动化仍按用户暂不授权保持未验。
