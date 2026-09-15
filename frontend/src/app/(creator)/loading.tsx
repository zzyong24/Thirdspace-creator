/** 服务端页面读取期间立即显示，保留共享侧栏可继续导航。 */
export default function Loading(){
  return <section data-slot="route-loading" role="status" aria-label="正在打开页面" className="flex min-h-64 flex-1 flex-col gap-5 p-6">
    <p className="text-sm text-muted-foreground">正在打开页面…</p>
    <div aria-hidden="true" className="h-7 w-40 animate-pulse rounded bg-muted"/>
    <div aria-hidden="true" className="h-40 animate-pulse rounded-xl bg-muted/60"/>
  </section>;
}
