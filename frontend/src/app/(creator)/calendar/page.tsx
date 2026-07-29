/**
 * T-599：独立内容日历入口退役为兼容跳转。
 *
 * 发布中心已经把月历提升为主体，因此 `/calendar` 不再创建第二个同等级入口。
 * 只透传合法 `YYYY-MM`，其余 query 不跨页面扩散。
 */
import { redirect } from "next/navigation";

const CALENDAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function CalendarRoutePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const rawMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const href =
    rawMonth && CALENDAR_MONTH.test(rawMonth)
      ? `/publishing?month=${rawMonth}`
      : "/publishing";
  redirect(href);
}
