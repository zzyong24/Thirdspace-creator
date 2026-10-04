import {CreativeWorkspaceHome} from "@/features/creative-canvas/creative-workspace-home";
import {Suspense} from "react";
export default function CanvasesPage(){return <Suspense fallback={<p className="p-6">正在打开创作画布…</p>}><CreativeWorkspaceHome/></Suspense>;}
