import {describe,it,expect} from "vitest";
import {predictionLockSource,predictionLockState} from "../src/resources/prediction-lock";
import {aiOperations} from "../src/operations/ai";
import {CLI_OPERATION_POLICIES} from "../src/cli-policy";
import {WORKSPACE_OPERATION_SCOPES} from "../src/workspace-operation-scope";
describe('原卡盲预测来源合同',()=>{
 const source={conversationId:'conv-owned',sourceMessageId:'message-owned',toolCallId:'tool-owned'};
 it('来源只允许原三个ID，不接受浏览器subject/正文/child伪造',()=>{
  expect(predictionLockSource.parse(source)).toEqual(source);
  for(const key of ['subjectId','projectId','fullText','rootTaskId','diagnoseTaskId'])expect(predictionLockSource.safeParse({...source,[key]:'forged'}).success).toBe(false);
 });
 it('GET无提交字段，首次start必须携带当前来源基线摘要与明确版本',()=>{
  expect(aiOperations.readPredictionLockSource.method).toBe('GET');
  const body={sourceMessageId:source.sourceMessageId,toolCallId:source.toolCallId,expectedBaselineDigest:'sha256:owned',policyVersion:1};
  expect(aiOperations.startPredictionLock.body!.parse(body)).toEqual(body);
  for(const key of ['subjectId','rubricVersionId','predictionId','fullText'])expect(aiOperations.startPredictionLock.body!.safeParse({...body,[key]:'forged'}).success).toBe(false);
  expect(aiOperations.startPredictionLock.body!.safeParse({...body,policyVersion:2}).success).toBe(false);
 });
 it('明确保历史来源unknown与正式空稿身份，未制造已锁布尔',()=>{
  const state={policyVersion:1,source,status:'legacy_unknown',subjectId:'output',projectId:'project',baselineDigest:null,baseline:null,diagnoseTaskId:null,resultId:null,predictionId:null,task:null};
  expect(predictionLockState.parse(state)).toEqual(state);
  expect(predictionLockState.safeParse({...state,locked:true}).success).toBe(false);
 });
 it('沿真实外部模型分类与账号组范围，不降为普通写入',()=>{
  expect(CLI_OPERATION_POLICIES['ai.predictionLocks.source'].effect).toBe('read');
  expect(CLI_OPERATION_POLICIES['ai.predictionLocks.start']).toMatchObject({effect:'external',asyncTask:true});
  expect(WORKSPACE_OPERATION_SCOPES['ai.predictionLocks.source']).toBe('group');
  expect(WORKSPACE_OPERATION_SCOPES['ai.predictionLocks.start']).toBe('group');
 });
});
