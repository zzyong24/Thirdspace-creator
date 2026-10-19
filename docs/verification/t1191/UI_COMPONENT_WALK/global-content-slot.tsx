import * as React from 'react';
import {AICopilotContent as RealAICopilotContent} from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/frontend/src/features/copilot/ai-copilot-content';
import {useDraftChatRequest,type DraftEditorPort} from '@/features/draft-workbench/draft-chat-request';
import {config,evidence,notify,scenario,target,creationTarget,originalText} from './state';
const viewModel:any={scenario:'default',kind:'ai-copilot',loading:false,error:null,prompt:'',chips:[],recommendedCommands:[],recentTasks:[],continuingTasks:[],quickEntries:[],smartRecommendations:[]};
const embed={surface:'project' as const,selection:{kind:'project',id:'protocol-project',title:'实际项目'},persistKey:'project:protocol-project',title:'编导对话'};
function Port(){const coordinator=useDraftChatRequest();React.useEffect(()=>coordinator.registerEditor({readState:()=>({target,generation:1,dirty:false}),prepareForTurn:async()=>{evidence.prepareCalls++;notify();if(config.prepareReject)throw Error('这次原保存尚未完成');return structuredClone(target);},previewCandidate:async()=>null,adoptCandidate:async()=>{throw Error('本harness禁止采用或保存');}} as DraftEditorPort),[coordinator.registerEditor]);return null;}
// Only adapts the unchanged neutral props/request at the real dialog content slot.
// The real AICopilotContent state, recovery handlers and SDK remain untouched.
export function AICopilotContent(){const coordinator=useDraftChatRequest();React.useEffect(()=>{if(scenario==='creation')coordinator.openChat({prefill:originalText,creationTarget,autoSend:true,onCreationSubmission:(state)=>{evidence.creationSubmission.push(state);notify();}});},[coordinator.openChat]);return <><Port/><RealAICopilotContent viewModel={viewModel} embed={{...embed,request:coordinator.request}}/></>;}
