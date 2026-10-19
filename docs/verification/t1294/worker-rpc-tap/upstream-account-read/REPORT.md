# Codex0.159.3 account/read -32603公开实现只读调查

已绑定官方同版本源码，不能凭数字码唯一确定本机命中的具体原因。真实本地32诊断只读到安全method/code，未读或保存用户account/config/error.message/data。本调查没有再运行SDK/协议/模型/资金；所有文本来自公开openai/codex。

官方tag rust-v0.159.3是annotated对象8e46774a94a745ffdf676bd7a8aa36466bbd4f99，git ls-remote的^{}解析到commit `01fc69f4026735edfdf6789820549727a4867b11`。本地npm只有启动器/元数据，原锁定binary生成的协议params已证明refreshToken:false合法，不能据错误猜参数错误。web工具429、目录API403、历史路径404均保留，不把失败查询当源码不存在；现已按真实mod链取到处理器，逐文件SHA/官方链接在SOURCE_BINDING.json。

## 真实分支边界

[主router](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server/src/message_processor.rs#L1775)把GetAccount交给AccountRequestProcessor；实际方法在[workspace_routing.rs](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server/src/request_processors/account_processor/workspace_routing.rs#L157)。它先按flag决定是否请求主动refresh，然后read_account(None)。其错误映射有明确区别：无效账户数据走invalid_request；workspace routing错误统一走internal_error。后者在[固定error code定义](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server/src/error_code.rs)中为-32603。因此不是JSON参数错误(-32602)，也不是只代表某一种登录错误。

对公开account/read的None请求，routing失败可来自：加载/重新加载要求失败、空账户ID、发现取消、账户代际改变、发现401且原内部恢复未能完成、一般发现失败、目标workspace缺失/重复、发现期间配置改变；发现得到的数据还需经过backend origin/HTTPS/凭据/override及要求一致性校验，这些失败也进入同一个内部码。source中另有仅session resolver的Some(request)分支所用provider/session URL和跨session backend改变错误，**不能把全部枚举都当成公开account/read直接可达**。

[read_account](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server/src/request_processors/account_processor/workspace_routing.rs#L190)依真实auth代际、账户和backend/requirements组合key隔离，发现并发由同key信号量协调并缓存成功结果；会调用accounts-check元数据读取。原SDK内部已经对401进行有限的unauthorized recovery，随后仍失败才投对应routing错误。账户owner改变会中止当前发现，不借别的账户的缓存。

[外层选择](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server/src/request_processors/account_processor/workspace_routing.rs#L407)对整个read包含一个固定15秒discovery timeout，并可因shutdown或owner改变停止。这个15秒是已锁定二进制内部的观察值，和CreatorOS每RPC120000ms不是同一层；本任务没有修改它。初始化[constructor](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/app-server/src/request_processors/account_processor.rs#L136)另行spawn一次read_account(None)作为startup发现，因此前台get_account可能与同owner发现共享/等待。以上均是可确定源码事实，不是已证明本机失败原因。

32诊断五个初次错误距trial开头分别约15.099秒, 15.093秒, 15.099秒, 15.095秒, 15.125秒（包含version/初始化/config及首会话关闭）；与15秒内层观察相容。第二同RPC只读成功也与缓存/并发发现或暂态分支相容。**没有原安全原因分类，就不能断言实际命中DiscoveryTimeout、权限401、配置或其它哪项，更不能称keychain/代理/登录根因已排除。**

## 对当前有限生产修复的准确含义

官方源码解释了为什么相同method/-32603可覆盖多类失败，而不是证明必须或总能重读。已正式第三轮规格只准同RPC同params、同signal一次非付费读取，最终第二response仍走原认证/图片能力校验；第二错误保原对象，原任务/paid turn不重发。这与“所有内部错误都可恢复”不同。29个factory fixture的实施独审另在account-read-implementation-review，本调查不代替正常build/fresh10/真实同ID完成或App验收。

调查到此收敛：实际owner/内部码范围已明确，具体本机失败分支仍未知。除非Root/用户进一步准确扩范围，不继续读用户私有错误、改认证/SDK/环境或增更多试验。
