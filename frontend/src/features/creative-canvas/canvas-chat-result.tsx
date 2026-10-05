"use client";
import Link from 'next/link';
/** 原宿主回执仅展示当前读/候选事实；正式应用始终由原Canvas按钮落实。 */
export function CanvasChatResult({result}:{result:Record<string,unknown>}){
 const isProposal=result.kind==='canvas.propose',canvasId=typeof result.canvasId==='string'?result.canvasId:null,error=typeof result.error==='string'?result.error:null;
 if(error)return <p role="alert" className="mt-2 rounded-lg border border-destructive/30 p-3 text-sm">{error}</p>;
 if(!canvasId)return <p role="status" className="mt-2 text-sm">画布结果尚不可读取，请保留原对话后核对。</p>;
 const revision=isProposal?result.baseRevision:result.revision;
 const count=isProposal?(Array.isArray(result.operations)?result.operations.length:null):(Array.isArray(result.nodes)?result.nodes.length:null);
 return <section aria-label="画布工具结果" className="mt-2 space-y-2 rounded-xl border bg-card p-3 text-sm"><p className="font-medium">{isProposal?'画布建议已保存，等待你检查':typeof result.title==='string'?`已读取画布：${result.title}`:'已读取当前画布'}</p><p className="text-xs text-muted-foreground">{typeof revision==='number'?`基于保存版本 ${revision}。`:''}{count===null?'':isProposal?`${count} 项候选；应用后才改变画布。`:`${count} 个节点，${Array.isArray(result.edges)?result.edges.length:0} 条连接。`}</p><Link href={`/canvases/${encodeURIComponent(canvasId)}`} className="inline-flex rounded-md border px-3 py-2">{isProposal?'回到画布检查并应用':'查看这张画布'}</Link></section>;
}
