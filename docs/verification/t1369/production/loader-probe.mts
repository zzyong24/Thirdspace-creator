import {ENDPOINTS} from '../../../../contract/src/index.ts';
import {createRuntimeDb} from '../../../../backend/src/db.ts';
// 真实TypeScript enum由同Node --import tsx入口加载；只核依赖图，不调用DB/模型/宿主。
enum ProbeMarker {Ready='T1369_OWNED_TSX_LOADER_OK'}
const marker:ProbeMarker=ProbeMarker.Ready;
if(typeof createRuntimeDb!=='function'||!Object.values(ENDPOINTS).some(endpoint=>endpoint.id==='pages.groupOverview.get'))throw Error('LOADER_MODULE_GRAPH_MISMATCH');
console.log(JSON.stringify({marker,contractLoaded:true,dbFactoryLoaded:true,dbFactoryCalled:false,modelCalled:false}));
