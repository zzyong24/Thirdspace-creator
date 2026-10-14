// 仅观察真实 ABI 参数，所有调用继续进入冻结的真实 WASM；没有 mock renderer。
export * from '/tmp/creatoros-t1274-preview-isolated/apps/web/node_modules/opencut-wasm/opencut_wasm.js';
import {renderFrame as realRenderFrame} from '/tmp/creatoros-t1274-preview-isolated/apps/web/node_modules/opencut-wasm/opencut_wasm.js';
export function renderFrame(frame:any) {(window as any).lastWireFrame=frame; return realRenderFrame(frame);}
