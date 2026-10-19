# T1250 Rust 当场证据（当前，不签完整验收）

原两项RED实际0通过/2失败：31秒合法frame被断开，取消不完整frame仍等待9.895721917秒。随后IPC实际列举18项，15通过/0失败/3原ignored，32.84秒。两轮均私有target、完整stdio/logclose、owned清理确认、12来源无漂移；全部原始回执与SHA见同名JSON。

Unix framing在accept时冻结120秒，reply在原dispatch结束后冻结120秒；部分字节不续期，owned stop每100ms醒来。拒绝/错误/browser忙碌回复同写入门。原动作、scope、PID、正文、CAS、原operation/receipt不改，断连不声称撤销已经派发的动作。

Windows守原真实CancelIoEx/drain，不能在OS尚持有OVERLAPPED/缓冲区时释放栈；意外wait错误不能伪装完成。Mac没有编译或运行Windows，不能由此签Windows物理停止。

IPC GREEN使用原standalone锁，其serde/libc/rand与正式main锁不同，故诚实只签该独立crate范围。新browser私有工具e333首次启动因输入清单排序门拒绝（0 Cargo/0 body），旧120f及真实红回执已保留。仅数组按完整path字符串排序修为82a952，328条path/SHA及其余字段不变，经root复核后才再次执行。

browser真实offline workspace解析、生产锁结构核验、编译、列举、串行测试均exit0。原main锁708包，实际新锁417包，仅私有测试根例外；每个其他包的name/version/source/checksum属于原main包集，差异0。真实workbench-browser编译1分17秒，实际列举12项：11通过/0失败/1原external_node_host_fixture ignored，31.98秒，未用子probe额外叠加通过数。31秒授权frame保持原ID、取消不完整frame不创建profile、部分字节不续期、反压和reply取消及原PID/授权族通过。完整EOF与日志close后，owned清理1017.696毫秒，survivors/unknown/proofErrors均0；328输入、tool、Node、Python/parser、精确库存、私有manifest及新锁前后均无漂移。

真实回执目录：`native-runs/e71d5704466b0f07a493a837`。新binary可供另行受控公共链测试；本轮没有启动Chrome/主App/PG/模型，也不把1项外部ignored称通过。仍待backend→Node→Rust公开同ID链、Windows实际编译/运行；主App未授权且未启动。模型评审身份unknown/inherited。
