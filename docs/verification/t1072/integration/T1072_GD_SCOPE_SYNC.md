# T1072与正式Growth GD身份规则同期记录

主控已独立读GD正式§5/§10与Creator原句，仅授权规范文字同期，未授权代码/wire变化或借用其它周期。

| 项目 | 准确来源与事实 |
|---|---|
| Growth正式GD源 | Root docs/contracts/T-188-owned-devices.md，§5第82行、§10第207/211/213行；SHA62c0754b74792856a6a78260e0cad9ca8060db2d116338c483a85be43adf941c |
| Growth实际记录 | T-188-GD cycle2 round2，源SHA一致、event55806eeba8c02bdd9456f4cfd8206378b5bd8a80e8a8a1b7bfabfb472edb3583；只证明该正式规范，不是Creator审核 |
| Creator同期写集 | docs/features/t1072-owned-devices.md第47行仅原一句；CHANGE_IMPACT/manifest局部待审映射及本记录，无代码/wire/数据库变化 |
| Creator原句之前SHA | 3582f23eaa51053354d60d64955987302e9dab2e4b68c49b175791e6350206cc；已因前轮engineering增量不同于原round2SPECf0a061... |
| Creator同期后SHA | 971a503642f67e92b5343772d96abc6800ba74814c014b30fdfb6b486e866f7b |
| Creator当前审核周期 | cycle1 round2/3，旧末event319ebdca0fabec788e0e3f79bce37850bc2667348a187432e50ca8652199eade；末round3未执行，不新增周期或借GD/T915 |
| 宪法 | docs/产品定位.md SHA86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800与Creator原round2一致 |
| 当前源码基点 | eae717e97cf308f9b01db8839cf819e574df1314；此次仅规范同期，不改变该源码或既有原生HTTP事实 |

register_device的客户端仍提交原client/projectKey/productRef；Growth内部匿名意向冻结catalog_product_id/project_key/client/原product_ref/machine/PKCE/原expiry，不先猜product_profile_id。本人API336选择exact licenseRef，原registrationRef+同手机号一次proof事务内固定owner.product_profile_id/owned_license_id/approved_by_user_id/ownership_version，poll/ACK继续复核同scope/profile。商品多个合法版本不是身份歧义；first/latest/default、别名碰撞、跨project/client仍拒绝。link_owner在创建时仍由原ticket/grant、OfficialCode→batch或accepted source精确解析唯一profile，不能改成无来源候选任意选择。

失效只限T1072该身份规范的下游当前正式复审/验收映射，manifest局部key T-1072-GD-identity-review标invalidated/gate未运行。旧SOURCE、JWS、期限、加密保存/回读与ACK真实HTTP证据保持准确原版本，不因旧事实保留就说此次正式复审通过。未改T915 R03a/R05a draft、审核事件、任务进度或控制工具。范围稳定后由主控安排本cycle独立最后recheck；这里不调用reviewctl或补写PASS。
