import {CanvasLibrary} from "@/features/creative-canvas/canvas-library";
import {Suspense} from "react";
export default function CanvasesPage(){return <Suspense fallback={<p className="p-6">正在打开创作画布…</p>}><CanvasLibrary/></Suspense>;}
