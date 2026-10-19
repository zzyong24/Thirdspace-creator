# 固定Node25实际打包CLI超过300秒双协议验证（待精确独评）

标准检查已真实通过：8文件116MCP PASS、0FAIL/0skip；scanner8PASS；proper mcp tsc exit0；原build-runtime和实际creatoros.cjs离线smoke exit0，all5child close/group0，210源和145包4914实现前后同字节。新实际bundle84260be6…与源/Node/原build script由input-binding绑定，完整raw actual-standard-checks保留。此处仅syntax0，尚未启动slowHTTP。

工具每case自身进程持有exclusive127.0.0.1:0 HTTP server，固定header或body两个scenario顺序执行，各310000ms真实延迟。服务只接受一个精确POST /api/v1/dispatch `{id:'accounts.list',input:{}}`、本nonce合成token/account/group原header，body场景先真headers+8字节partial，再310秒原完整body；header场景310秒后才真实headers和全部body。固定Node运行**实际新包creatoros.cjs** `call accounts.list --input {} --account <owned> --group <owned> --json`，不以tsx/helper/globalfetchprobe代包。原clientFor显式CREATOROS_BASE_URL分支，不读取用户installed连接/默认account/group；login email/password空，token为本轮合成fixture。cliJSON原requestId/account/group/operation/data/meta及完整重构原envelope hash相符、POST精确1、release/header阶段实际>=300s、真实EOF/close后才能本casePASS。协议fixture不冒业务账号或模型成功。

每case startup120k＋包CLI child8.4M（原无凭据dispatch8.28M完整保）＋393f完整helper收尾2.16M＋HTTPserver cleanup120k＝10.8M；两个case全串行，outer22.56M=prepare240k+2×10.8M+after600k+margin120k，第一行入口clock、monotonic60k、正常即时EOF。各stage实际120k/310k，不借父outer缩HTTP原观察，不续persistent任务期限。下一case必须完整remaining且原signal未停。SIGINT/TERM只本scope AbortSignal，393f依据真实group/birth/uid完成原child收尾；HTTP listener和全部socket本工具持有，finally clear本timer、close其server和socket，未确认保非零。

HOME/CODEX_HOME原值，不拷auth，清CreatorOS及供应商secret/PG原env，仅注本fixtureBASEURL/token和freshTMP。不启动App/PG/模型/浏览器/Workerdist/发布，不读取正式凭据或外网。全部真实CLI stdout/stderr日志、HTTP阶段事件、原scope requesthash、Node/bundleSHA、childclose/group、源后核放freshos.tmpdir realpath/nonce。本包若失败保真实FAIL/nonzero，另一独立scenario可继续，不自动重发该请求。tool/matrix/meta只声明，不造计量publishingCalls0。

必须root+peer精确源review准入：`CREATOROS_T1252_GREEN_TOOL_REVIEWED=1 CREATOROS_T1252_GREEN_TOOL_SHA256=<actual> CREATOROS_T1252_GREEN_BINDING_SHA256=<actual>` 固定Node `.../launch.cjs`。约真实10–11分钟，完整上界保原8.28M请求，不固定300s反杀。公共Rust同ID/Chromium累>300属于随后独立真实服务链，本双fixture只签传输与实际包运行。
