# T-1046 初次独立合同评审

结果：需修复 2 项 major 后复核，尚不能将实施前合同 Gate 标 PASS。

已确认方向：native3 是唯一可写工程；source/ASR经原后端settlement证明，普通save不能自造或改证明；120000 tick和源timebase用BigInt有理数；局部仅1x基础实例，rich局部review_only，整clip/手工仍可用；重复media使用按实例；主轨删除窗口ripple，独立轨保留绝对位置；来源失效/缺模型按局部降级。

1. **REV-1046-001 所选集合的影响确认缺少版本绑定**：get按单建议生成nativeImpact，而adopt未绑定所选多项合并impact。独立轨改动后主轨touch不变，可rebind新revision而继续沿旧影响确认。请补同一所选集合/当前revision的实际合并影响与digest/确认身份，采用重核，改变则重展示确认。
2. **REV-1046-002 bridge写tracks却只明确核before主轨**：后台采用期间合法独立轨编辑/晚素材导入可被整tracks写回覆盖。请明确仅patch main并保持最新独立轨，或原生层锁定所有写入并核完整beforeTracks；typed冲突保留本地稿/owner回执；重放未知ACK不能再次command、尤其不能覆盖用户undo。

此评审未参与设计；未扩展字幕/全轨映射范围、未要求第二执行器或第二工程，也未把现有宽JSON未实现状态当新增实现缺陷。来源真实性/时间安全/旧预约原解释等应按已冻结验收矩阵落实测试。本轮只查合同，未运行付费模型或浏览器。
