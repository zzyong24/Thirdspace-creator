import { describe, it, expect } from 'vitest';
import { assessAudienceTask } from './audience-task-assessment';
const stamp = '2026-10-02T12:00:00.000Z';
const workspace = { version: 1, positioningVersionId: 'p1', config: { audience: '技术小白', platform: 'douyin', preparationMinutes: 240, audienceGrid: [], industryGrid: [], problems: [], authorMaterials: [] }, rejected: [] };
const task = { propositionKey: '录音转待办', audience: '技术小白', audienceFit: 'matched', audienceReason: '有音频即可操作', job: '把会议录音整理成待办表', input: '会议录音样例', entryUrl: 'https://example.com', steps: ['上传音频','核对人名日期'], output: '待办表', acceptance: '人名日期无遗漏', costAndLimits: '费用待核', authorCanDo: '会操作', viewerCanUse: '浏览器上传', estimatedMinutes: 120, route: 'record', testPlan: { sample: '授权样例', steps: ['上传','核对'], visibleResult: '待办表', acceptance: '逐项核对', failureStory: '解释漏项和限制' }, cellIds: [], problemIds: [], authorMaterialIds: [], changedFromCandidateId: null, changeReason: '' };
describe('观众任务：事实门与安全降级', () => {
 it('无来源不冒充可录，保留假设待测任务与计划', () => { const a = assessAudienceTask(task, workspace, stamp); expect(a.route).toBe('test'); expect(a.evidenceStatus).toBe('hypothesis'); });
 it('受众未知或明确不适合不能被高分覆盖', () => {
  expect(assessAudienceTask({ ...task, audienceFit: 'uncertain' }, workspace, stamp).route).toBe('research');
  expect(assessAudienceTask({ ...task, audienceFit: 'mismatched' }, workspace, stamp).route).toBe('unsuitable');
 });
 it('不存在的来源/格子降级，超预算进储备，未知入口进研究', () => {
  expect(assessAudienceTask({ ...task, cellIds: ['invented'] }, workspace, stamp).route).toBe('research');
  expect(assessAudienceTask({ ...task, estimatedMinutes: 300 }, workspace, stamp).route).toBe('reserve');
  expect(assessAudienceTask({ ...task, entryUrl: '' }, workspace, stamp).route).toBe('research');
 });
 it('仅用户记录的有效入口与完整实测结果可录，过期不能沿用', () => {
  const author = { id:'m', text:'作者测试', sourceRef:'本地实验/1', projectId:null, contextRef:null, entryVerification:{status:'verified',checkedAt:'2026-10-01T00:00:00.000Z',expiresAt:'2026-10-03T00:00:00.000Z',entryUrl:task.entryUrl,conditions:'中文浏览器，免费额度'},result:{input:task.input,steps:task.steps,output:task.output,acceptance:task.acceptance,resultRef:'local-result/1'} };
  const w = { ...workspace, config: { ...workspace.config, authorMaterials: [author] } };
  expect(assessAudienceTask({ ...task, authorMaterialIds: ['m'] }, w, stamp).route).toBe('record');
  expect(assessAudienceTask({ ...task, authorMaterialIds: ['m'] }, w, '2026-10-04T00:00:00.000Z').route).not.toBe('record');
 });
});

it('配置网格后缺配对、旧版本或无关系理由只作研究',()=>{
 const cell=(id:string)=>({id,text:id,sourceRefs:[],evidence:'hypothesis'});
 const w={...workspace,config:{...workspace.config,gridVersion:2,audienceGrid:[cell('a')],industryGrid:[cell('i')]}};
 expect(assessAudienceTask(task,w,stamp).route).toBe('research');
 const paired={...task,gridVersion:2,cellIds:['a','i'],gridRelationReason:'用视频方法把录屏交成教程'};
 expect(assessAudienceTask(paired,w,stamp).route).toBe('test');
 expect(assessAudienceTask({...paired,gridVersion:1},w,stamp).route).toBe('research');
});
