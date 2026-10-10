import {useConfig} from './state';
export function useAssistantEngine(){const state=useConfig();return {engine:state.engine,available:state.available,checking:state.checking,status:state.checking?'正在核对编导引擎':state.available?'隔离引擎状态就绪':'隔离引擎状态不可用'};}
