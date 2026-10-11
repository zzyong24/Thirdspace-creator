# T1216 全功能截图夹具类型核对

本轮frontend exec tsc --noEmit实际exit2：tests/helpers/test-environment.ts自定义自动fixture t1207ScenarioCapture未在Playwright fixture类型注册，另page/context/provide/testInfo推断隐式any。源e5c已有该文件，本轮未改。保docs/verification/t1214/frontend-type.log，先原安装源tsc基线及fixture控制/清理语义，独评后最小类型声明；不排除测试文件、any粗转或关闭类型门。当前无产品写集。
