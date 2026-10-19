"use client";

// Adapted from basketikun/infinite-canvas, web/src/components/canvas/canvas-connections.tsx
// Commit dab19adc0847e32e39b7fc8ff90cb392561fb826; MIT notice: THIRD_PARTY_NOTICES.md.
import type {CanvasNode} from "@creatoros/contract";
import {defaultSize} from "./infinite-canvas-node";

type Edge={id:string;source:string;target:string;label?:string};
type Point={x:number;y:number};
function center(node:CanvasNode,side:"source"|"target"):Point{const size={...defaultSize(node.type),...node.size};return {x:node.position.x+(side==="source"?size.width:0),y:node.position.y+size.height/2};}
function path(start:Point,end:Point){const bend=Math.max(50,Math.abs(end.x-start.x)*0.5);return `M ${start.x} ${start.y} C ${start.x+bend} ${start.y}, ${end.x-bend} ${end.y}, ${end.x} ${end.y}`;}
export function InfiniteCanvasConnections({nodes,edges,connecting,selectedEdgeId,onSelect}:{nodes:CanvasNode[];edges:Edge[];connecting:{sourceId:string;point:Point}|null;selectedEdgeId:string|null;onSelect:(id:string)=>void}){
 const byId=new Map(nodes.map(node=>[node.id,node]));
 const points=nodes.flatMap(node=>[center(node,"source"),center(node,"target")]);if(connecting)points.push(connecting.point);
 const left=points.length?Math.min(...points.map(point=>point.x))-120:0,top=points.length?Math.min(...points.map(point=>point.y))-120:0;
 const width=points.length?Math.max(240,Math.max(...points.map(point=>point.x))-left+120):240,height=points.length?Math.max(240,Math.max(...points.map(point=>point.y))-top+120):240;
 const local=(point:Point)=>({x:point.x-left,y:point.y-top});
 return <svg aria-label="画布连接" className="absolute overflow-visible" width={width} height={height} style={{left,top,pointerEvents:"none"}}>
  {edges.map(edge=>{const source=byId.get(edge.source),target=byId.get(edge.target);if(!source||!target)return null;const line=path(local(center(source,"source")),local(center(target,"target")));return <g key={edge.id} data-canvas-connection={edge.id}>
   <path d={line} fill="none" stroke="transparent" strokeWidth={18} style={{pointerEvents:"stroke",cursor:"pointer"}} onPointerDown={event=>{event.stopPropagation();onSelect(edge.id);}}/>
   <path d={line} fill="none" stroke={selectedEdgeId===edge.id?"var(--primary)":"var(--muted-foreground)"} strokeWidth={selectedEdgeId===edge.id?3:2} opacity={0.7}/>
  </g>;})}
  {connecting&&byId.get(connecting.sourceId)?<path d={path(local(center(byId.get(connecting.sourceId)!,"source")),local(connecting.point))} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 4"/>:null}
 </svg>;
}
