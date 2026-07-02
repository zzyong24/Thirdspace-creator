import { redirect } from "next/navigation";

// [T-046 单机免登录] 注册页已下线(同 /login):单机产品一机一创作者,无自助注册。
// RegisterForm 组件与 /api/v1/auth/register route 保留(内部/脚本用)。
export default function RegisterPage(): never {
  redirect("/");
}
