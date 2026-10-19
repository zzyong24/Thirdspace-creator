/** 复用图表空态：保留网格与零基线，不编造量程或测得数值。 */
export function EmptyChartGrid({message,dateLabels=[]}:{message:string;dateLabels?:readonly string[]}) {
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="grid min-h-40 grid-cols-[2rem_minmax(0,1fr)] gap-2">
      <div aria-hidden="true" className="flex flex-col justify-between text-right text-xs text-muted-foreground tabular-nums"><span>—</span><span>0</span></div>
      <div className="relative flex items-center justify-center border-b border-l border-border px-4 text-center">
        <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {[0,25,50,75].map(y=><line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.4"/>)}
        </svg>
        <p className="relative text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
    {dateLabels.length>0?<div className="ml-10 flex justify-between gap-2 text-xs text-muted-foreground tabular-nums"><span>{dateLabels[0]}</span>{dateLabels.length>1?<span>{dateLabels[dateLabels.length-1]}</span>:null}</div>:null}
  </div>;
}
