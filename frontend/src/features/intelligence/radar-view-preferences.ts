import {radarScope} from "./intelligence-workbench-types";
import type {RadarScopeInput,RadarSort,RadarTranscriptState,RadarTopicState} from "./intelligence-workbench-types";
export interface RadarViewPreferences {
  sort:RadarSort;transcriptState:RadarTranscriptState|null;topicState:RadarTopicState|null;
  query:string;sourceQuery:string;collectionId:string|null;sourceId:string|null;
}
export const radarViewKey=(input:RadarScopeInput)=>{const scope=radarScope(input);return scope.groupId?`creatoros:radar-view:v2:group:${scope.groupId}`:`creatoros:radar-view:v1:${scope.accountId}`;};
// SEMANTIC_BOUNDARY_ALLOW: 仅校验用户显式选择的界面值，不做内容判断或排序决策。
export function readRadarView(accountId:RadarScopeInput):RadarViewPreferences|null {
  try {
    const value=JSON.parse(window.localStorage.getItem(radarViewKey(accountId))??"null");
    if(!value||typeof value!=="object")return null;
    if(!["published_desc","collect_desc","like_desc"].includes(value.sort))return null;
    if(![null,"not_extracted","processing","extracted","attention"].includes(value.transcriptState))return null;
    if(![null,"not_generated","generating","awaiting_confirmation","converted","attention"].includes(value.topicState))return null;
    if(typeof value.query!=="string"||typeof value.sourceQuery!=="string")return null;
    if(![value.collectionId,value.sourceId].every(id=>id===null||typeof id==="string"))return null;
    return value as RadarViewPreferences;
  }catch{return null;}
}
export function saveRadarView(accountId:RadarScopeInput,view:RadarViewPreferences){
  try {window.localStorage.setItem(radarViewKey(accountId),JSON.stringify(view));}catch{/* 存储不可用不影响页面。 */}
}
