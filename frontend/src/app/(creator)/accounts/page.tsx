/**
 * [T-063a] IA 收敛:旧一级路由 `/accounts` 永久重定向(301/308)→ `/settings?tab=account`。
 *
 * 北极星 SPEC §1:账号绑定/矩阵号管理是配置形态,并入设置「账户」页签。原页面的 feature 组件文件全部保留(删壳不删肉),
 * 由新宿主 tab 内嵌复用;此处只改 app 路由层。带参深链(如 ?sort=)不随迁,
 * 落到目标 tab 即可(SPEC §3 T-063a)。书签/深链永久可用(SPEC §4-3)。
 */
import { permanentRedirect } from "next/navigation";

export default function Page(): never {
  permanentRedirect("/settings?tab=account");
}
