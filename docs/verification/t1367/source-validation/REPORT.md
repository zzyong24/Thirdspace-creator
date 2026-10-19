# T1367 source／旧消费者模块最终补验

本模块签最终未提交字节：

- source `b694b4145fd7819e659a4a6d204a834827958a5d5e1d951d7dce4e47bfa6ee72`
- witness `d1c0df986c22e0938e6083324057d27b55bb29f9622810feca8af59229a20f6b`
- source测试 `cdf44c6b21d535fb235b0fc7d9658071a44f11c02e3d16d51fee7ff048d16d44`

|最终实际检查|结果|墙钟秒|原件|
|---|---|---:|---|
|source预算与固定phase安全投影|1文件89PASS / exit0|1.305|source-phase-attempt01.json|
|DOM witness／Wujie／公众号同页导航|3文件59PASS / exit0|5.573|witness-consumers-attempt02.json|
|worker typecheck|exit0|26.571|worker-typecheck-attempt03.json|
|timeout静态门|exit0|14.436|timeout-static-attempt02.json|

以上各次开始/结束输入SHA一致，无超时或自动重试。完整既有timeout门原exit0、174PASS／35.442秒；19个实际门脚本/测试消费者hash最终复核未变，分证继承，不重复整门。

初版旧消费者145PASS、新版89d6消费者59PASS、types原6FAIL与修后各次结果均原件保留，旧摘要另存before-final-d1c0df98。此次对d1的明确补验不把89d6的PASS冒作新源结果。IMPL001窄公共RED/GREEN与最终公共60由probe独立记录，本模块未重复其长测试，不代签其墙钟。

仅隔离合成消费者；没有真实账号/profile/业务库/平台读写、安装、依赖变更、产品或测试编辑、中央文书变更，也未full reconcile。实际站点owner和采集恢复仍UNKNOWN，site-safety边界仍有效，不据此完成T1367或放行真实操作。

机器可审明细见SAFE_SUMMARY.json及各attempt原件。
