/**
 * 素材页链接基座([T-063d] 三 tab 页内统一)。
 *
 * 素材页的筛选/搜索/分页全靠 URL query 重渲,但链接原来硬编码 `/assets?…`;
 * 内嵌进 /library?tab=assets 后,旧路由 301 会**丢 query**(T-063a「带参深链
 * 不随迁」),等于筛选/分页全断。内嵌形态必须直链 `/library?tab=assets&…`。
 */
export function assetsHref(sp: URLSearchParams, embedded: boolean): string {
  if (embedded) {
    const p = new URLSearchParams({ tab: "assets" });
    sp.forEach((v, k) => p.set(k, v));
    return `/library?${p.toString()}`;
  }
  const qs = sp.toString();
  return qs.length > 0 ? `/assets?${qs}` : "/assets";
}
