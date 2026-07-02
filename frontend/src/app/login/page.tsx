import { redirect } from "next/navigation";

// [T-046 单机免登录] 登录页已下线:单机产品打开即用(resolveSession 以本机主用户直通),
// 旧书签/外链落到 /login 一律回首页。登录表单组件与 /api/v1/auth/* route 保留
// (脚本/curl 仍可 login 拿 cookie;完整的激活码方案见 T-045 SPEC,当前搁置)。
export default function LoginPage(): never {
  redirect("/");
}
