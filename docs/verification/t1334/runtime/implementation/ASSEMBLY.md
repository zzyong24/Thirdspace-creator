# T1334 同链 GREEN 装配

仅唯一caller显式传入 `undefined,false,true`，既有参数断言由2参改为精确5参；其它caller/default/协议名字不变。原RED v3当前公共测试逐字SHA7eedc2ee6872fd03507803635b7e78ab96f26314cb0ef21d6aadca534034b2d1，preparation-v2两个I/O替身、preparation-v3 wrapper/config全部只读原用。三业务断言/原预算/独立串行case/清理不变。

worker-green是806a42源码基线+唯一caller工作树增量的新独立bundle，不是原806包或原RED worker字节。281实际build输入记录在binding；构建保留原CJS import.meta warning（源码已有__filename分支），未写shared dist/未install。外部供应商合成I/O，0真实付费模型；只能证明实际CLI/config→原Host/ledger/采纳组合，不能冒真实模型可见性。

GREEN锁沿用RED v3实际完整afterInputDrift=[]及C/R当前0源/deps写的未变记录，仅重算caller/test和新独立worker/binding/helper。mandatory wrapper启动前/结束后仍完整核所有files/links/absent。不会重复复制依赖/数据库。

命令：`T1334_APPROVED=1 python3 docs/verification/t1334/runtime/preparation-v3/run.py green-v1`。预算/原期限/cleanup完全复用原已审wrapper，各根1800秒，不续期。三个8h test及hook/setup/全锁hash/cleanup外层92760秒，真实业务根独立原deadline。
