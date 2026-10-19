import {evidence,notify} from './state';
async function empty(name:string,args:unknown[]){evidence.readCalls.push({name,args});notify();return [];}
export const client={listAITasks:(...args:unknown[])=>empty('listAITasks',args),listProjects:(...args:unknown[])=>empty('listProjects',args),listConversations:(...args:unknown[])=>empty('listConversations',args),listMessages:(...args:unknown[])=>empty('listMessages',args)};
