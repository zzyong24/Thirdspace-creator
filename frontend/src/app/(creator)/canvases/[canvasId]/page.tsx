import {CanvasEditor} from "@/features/creative-canvas/canvas-editor";
export default async function CanvasPage({params}:{params:Promise<{canvasId:string}>}){
 const {canvasId}=await params;
 return <CanvasEditor key={canvasId} canvasId={canvasId}/>;
}
