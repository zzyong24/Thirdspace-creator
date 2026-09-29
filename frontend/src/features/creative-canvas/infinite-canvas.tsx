"use client";

// Adapted from basketikun/infinite-canvas, web/src/components/canvas/infinite-canvas.tsx
// Commit dab19adc0847e32e39b7fc8ff90cb392561fb826 (MIT; see THIRD_PARTY_NOTICES.md).
// CreatorOS adapts wheel gestures and keeps viewport ownership in the account-scoped editor.
import {useCallback,useEffect,useRef,useState,type DragEvent,type MouseEvent,type PointerEvent as ReactPointerEvent,type ReactNode} from "react";
type Viewport={x:number;y:number;zoom:number};

type Props={
 containerRef:React.RefObject<HTMLDivElement|null>;
 viewport:Viewport;
 tool:"select"|"pan";
 onViewportChange:(value:Viewport)=>void;
 onViewportCommit:(value:Viewport)=>void;
 onBlankPointerDown:(event:ReactPointerEvent<HTMLDivElement>)=>void;
 onBlankDoubleClick:(event:MouseEvent<HTMLDivElement>)=>void;
 onContextMenu:(event:MouseEvent<HTMLDivElement>)=>void;
 onDrop:(event:DragEvent<HTMLDivElement>)=>void;
 children:ReactNode;
 overlay?:ReactNode;
};

const interactiveSelector="[data-canvas-object],[data-canvas-connection],[data-canvas-control],input,textarea,select,button,[contenteditable=true]";
const scrollSelector="[data-canvas-scroll],input,textarea,select,[contenteditable=true]";
const keyboardControlSelector=`${scrollSelector},button,a,[role=button]`;
const clamp=(value:number)=>Math.min(4,Math.max(0.05,value));

export function InfiniteCanvas({containerRef,viewport,tool,onViewportChange,onViewportCommit,onBlankPointerDown,onBlankDoubleClick,onContextMenu,onDrop,children,overlay}:Props){
 const viewportRef=useRef(viewport),panRef=useRef<{pointerId:number;startX:number;startY:number;origin:Viewport}|null>(null),wheelTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [spacePressed,setSpacePressed]=useState(false),[panning,setPanning]=useState(false);
 useEffect(()=>{viewportRef.current=viewport;},[viewport]);
 useEffect(()=>{const down=(event:KeyboardEvent)=>{if(event.code!=="Space"||event.target instanceof Element&&event.target.closest(keyboardControlSelector))return;event.preventDefault();setSpacePressed(true);};
  const up=(event:KeyboardEvent)=>{if(event.code==="Space")setSpacePressed(false);};
  const blur=()=>{setSpacePressed(false);panRef.current=null;setPanning(false);};
  window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",blur);
  return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",blur);};
 },[]);
 const commit=useCallback(()=>onViewportCommit(viewportRef.current),[onViewportCommit]);
 useEffect(()=>{const root=containerRef.current;if(!root)return;
  const wheel=(event:WheelEvent)=>{const target=event.target instanceof Element?event.target:null;if(target?.closest(scrollSelector))return;event.preventDefault();
   const current=viewportRef.current;
   if(event.ctrlKey||event.metaKey){const rect=root.getBoundingClientRect();const px=event.clientX-rect.left,py=event.clientY-rect.top;const zoom=clamp(current.zoom*Math.exp(-event.deltaY*0.002));const ratio=zoom/current.zoom;onViewportChange({x:px-(px-current.x)*ratio,y:py-(py-current.y)*ratio,zoom});}
   else onViewportChange({x:current.x-event.deltaX,y:current.y-event.deltaY,zoom:current.zoom});
   if(wheelTimerRef.current)clearTimeout(wheelTimerRef.current);wheelTimerRef.current=setTimeout(commit,180);
  };
  root.addEventListener("wheel",wheel,{passive:false});return()=>{root.removeEventListener("wheel",wheel);if(wheelTimerRef.current)clearTimeout(wheelTimerRef.current);};
 },[containerRef,onViewportChange,commit]);
 const pointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{const target=event.target instanceof Element?event.target:null;if(target?.closest(interactiveSelector))return;
  if(event.button===1||event.button===0&&(tool==="pan"||spacePressed)){event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);panRef.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin:viewportRef.current};setPanning(true);return;}
  if(event.button===0){event.preventDefault();onBlankPointerDown(event);}
 };
 const pointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{const pan=panRef.current;if(!pan||pan.pointerId!==event.pointerId)return;onViewportChange({...pan.origin,x:pan.origin.x+event.clientX-pan.startX,y:pan.origin.y+event.clientY-pan.startY});};
 const pointerUp=(event:ReactPointerEvent<HTMLDivElement>)=>{const pan=panRef.current;if(!pan||pan.pointerId!==event.pointerId)return;panRef.current=null;setPanning(false);commit();};
 const doubleClick=(event:MouseEvent<HTMLDivElement>)=>{const target=event.target instanceof Element?event.target:null;if(!target?.closest(interactiveSelector))onBlankDoubleClick(event);};
 return <div ref={containerRef} data-testid="infinite-canvas" className="relative h-full w-full select-none overflow-hidden bg-background" style={{cursor:panning?"grabbing":tool==="pan"||spacePressed?"grab":undefined}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onDoubleClick={doubleClick} onContextMenu={onContextMenu} onDragOver={event=>event.preventDefault()} onDrop={onDrop}>
  <div className="pointer-events-none absolute inset-0 opacity-40" style={{backgroundImage:"radial-gradient(circle, var(--border) 1px, transparent 1.2px)",backgroundSize:`${Math.max(4,48*viewport.zoom)}px ${Math.max(4,48*viewport.zoom)}px`,backgroundPosition:`${viewport.x}px ${viewport.y}px`}}/>
  <div data-testid="canvas-world" className="absolute left-0 top-0 origin-top-left" style={{transform:`translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`}}>{children}</div>
  {overlay}
 </div>;
}
