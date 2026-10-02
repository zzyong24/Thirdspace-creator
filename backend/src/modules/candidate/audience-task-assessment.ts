import { audienceTaskProposal, topicRecommendationContext, type AudienceTaskAssessment, type TopicSourceRead } from '@creatoros/contract';
/** SEMANTIC_BOUNDARY_ALLOW: 只核验模型显式引用、类型、时间及用户预算，绝不按词/分数挑题。 */
export function assessAudienceTask(raw: unknown, context: unknown, now: string, sourceReads: TopicSourceRead[] = []): AudienceTaskAssessment {
 const proposal=audienceTaskProposal.parse(raw),w=topicRecommendationContext.parse(context),notes:string[]=[];
 const allCells=[...w.config.audienceGrid,...w.config.industryGrid];
 const validCells=proposal.cellIds.filter(id=>allCells.some(c=>c.id===id));
 const problems=proposal.problemIds.filter(id=>w.config.problems.some(p=>p.id===id));
 const authors=proposal.authorMaterialIds.filter(id=>w.config.authorMaterials.some(m=>m.id===id));
 const invalid=validCells.length!==proposal.cellIds.length||problems.length!==proposal.problemIds.length||authors.length!==proposal.authorMaterialIds.length;
 let route=proposal.route;
 if(invalid){route='research';notes.push('部分材料引用不存在，需补证据');}
 const complete=proposal.job&&proposal.input&&proposal.steps.some(s=>s.trim())&&proposal.output&&proposal.acceptance&&proposal.viewerCanUse&&proposal.costAndLimits;
 if(w.config.audienceGrid.length&&w.config.industryGrid.length&&(!validCells.some(id=>w.config.audienceGrid.some(c=>c.id===id))||!validCells.some(id=>w.config.industryGrid.some(c=>c.id===id))||proposal.gridVersion!==w.config.gridVersion||!proposal.gridRelationReason)){route='research';notes.push('缺少当前双九宫格配对或任务关系说明，待重审');}
 if(!complete){route='research';notes.push('任务、操作或验收材料尚不完整');}
 if(!proposal.entryUrl){route='research';notes.push('观众入口尚未确认');}
 const plan=proposal.testPlan;
 const testable=plan&&plan.sample&&plan.steps.some(s=>s.trim())&&plan.visibleResult&&plan.acceptance&&plan.failureStory;
 const evidence=w.config.authorMaterials.filter(m=>authors.includes(m.id));
 const verified=evidence.some(m=>m.result&&m.entryVerification?.status==='verified'&&m.entryVerification.entryUrl===proposal.entryUrl&&Date.parse(m.entryVerification.checkedAt)<=Date.parse(now)&&Date.parse(m.entryVerification.expiresAt)>Date.parse(now));
 if(route==='record'&&!verified){route=!invalid&&complete&&proposal.entryUrl&&testable?'test':'research';notes.push('没有用户记录的有效入口核验与一手结果，不能称可录');}
 if(route==='test'&&!testable){route='research';notes.push('实测样例或失败说明缺失');}
 if(proposal.estimatedMinutes===null){route='research';notes.push('作者备料时间未知');}
 else if(proposal.estimatedMinutes>w.config.preparationMinutes&&(route==='record'||route==='test'||route==='reserve')){route='reserve';notes.push('超过当前账号备料预算');}
 if(proposal.audienceFit==='uncertain'){route='research';notes.push('当前定位下的观众任务匹配待确认');}
 if(proposal.audienceFit==='mismatched'){route='unsuitable';notes.push('模型判断与当前观众不适合');}
 const rejected=w.rejected.find(r=>r.propositionKey&&r.propositionKey===proposal.propositionKey);
 if(rejected&&!proposal.changedFromCandidateId){route='unsuitable';notes.push('同一命题已有拒绝反馈');}
 if(proposal.changedFromCandidateId&&(!w.rejected.some(r=>r.id===proposal.changedFromCandidateId)||!proposal.changeReason.trim())){if(route!=='unsuitable')route='research';notes.push('改造依据或反馈引用缺失');}
 return {...proposal,route,cellIds:validCells,problemIds:problems,authorMaterialIds:authors,workspaceVersion:w.version,positioningVersionId:w.positioningVersionId,assessedAt:now,evidenceStatus:w.config.problems.some(p=>problems.includes(p.id)&&p.role!=='hypothesis')?'evidence':'hypothesis',verificationNotes:notes,sourceReads};
}
