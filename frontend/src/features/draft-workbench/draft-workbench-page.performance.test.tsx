// @vitest-environment node
import * as React from 'react';
import {PassThrough} from 'node:stream';
import {renderToPipeableStream} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import type {DraftWorkbenchVm,DraftWorkbenchDeferred} from './draft-workbench-data';
vi.mock('@/lib/contract-client',()=>({client:{}}));
vi.mock('@/features/script/script-rich-editor',()=>({ScriptRichEditor:({initialHtml}:any)=><div data-testid="body-editor" dangerouslySetInnerHTML={{__html:initialHtml}}/>}));
vi.mock('@/features/script/script-structure-view',()=>({ScriptStructureToggle:({children}:any)=><>{children}</>}));
vi.mock('@/features/script/script-version-restore',()=>({ScriptVersionMenu:()=>null}));
vi.mock('@/components/resources/cover-thumb',()=>({CoverThumb:()=>null}));
vi.mock('./topic-card',()=>({TopicCard:()=>null}));
vi.mock('./content-direction-actions',()=>({ContentDirectionActions:()=>null}));
vi.mock('./draft-chat-rail',()=>({DraftChatRail:()=>null}));
vi.mock('./draft-chat-request',()=>({DraftChatRequestProvider:({children}:any)=><>{children}</>}));
vi.mock('./project-preparation-context',()=>({ProjectPreparationProvider:({children}:any)=><>{children}</>}));
vi.mock('./draft-resizable-layout',()=>({DraftResizableLayout:({left,right}:any)=><div>{left}{right}</div>}));
vi.mock('./creation-flow-ctas',()=>({CreationFlowCtas:()=>null}));
vi.mock('./thesis-skeleton-panel',()=>({ThesisSkeletonPanel:()=>null}));
vi.mock('./ammo-note-form',()=>({AmmoNoteForm:()=>null}));
vi.mock('./ammo-dump-zone',()=>({AmmoDumpZone:()=>null}));
vi.mock('./ammo-card-list',()=>({AmmoCardList:({ammo}:any)=><div>{ammo.map((item:any)=>item.title).join(',')}</div>}));
vi.mock('./draft-primary-action',()=>({DraftPrimaryAction:()=>null}));
vi.mock('./project-pipeline-panel',()=>({ProjectPipelinePanel:()=>null}));
vi.mock('./register-published-form',()=>({RegisterPublishedForm:()=>null}));
vi.mock('./blind-predict-row',()=>({BlindPredictRow:()=>null}));
vi.mock('./publish-package-cta',()=>({PublishPackageCta:()=>null}));
vi.mock('./script-review-gate',()=>({ScriptReviewGate:()=>null,ReviewSoftGateHint:()=>null}));
import {DraftWorkbenchPage} from './draft-workbench-page';

it('真实React服务端流先输出正文与加载提示，慢素材稍后补齐',async()=>{
  let finish!:(value:Awaited<DraftWorkbenchDeferred['materials']>)=>void;
  const materials=new Promise<Awaited<DraftWorkbenchDeferred['materials']>>(resolve=>{finish=resolve;});
  const deferred:DraftWorkbenchDeferred={materials,publication:materials.then(()=>({publishPack:null,projectCoverAssetId:null,blindPrediction:null})),review:Promise.resolve({scriptReview:null}),transcript:Promise.resolve('unknown')};
  const vm:DraftWorkbenchVm={project:{id:'p',title:'项目',brief:'',briefDetail:null,currentStage:'script',imported:false,douyinExternalId:null,transcriptState:'unknown'},scriptArtifactId:null,thesis:null,outputId:null,script:{editorHtml:'<p>正文先于慢资料可用</p>',sections:[],versionCount:0},radarDraftSeed:null,publishPack:null,projectCoverAssetId:null,publishUnlocked:false,blindPrediction:null,ammo:[],scriptReview:null};
  const stream=new PassThrough();let html='';const errors:unknown[]=[];
  stream.on('data',chunk=>{html+=chunk;});
  const ended=new Promise<void>(resolve=>stream.on('end',resolve));
  let shell!:(value?:unknown)=>void;const ready=new Promise(resolve=>{shell=resolve;});
  const rendering=renderToPipeableStream(<DraftWorkbenchPage vm={vm} deferred={deferred}/>,{onShellReady(){rendering.pipe(stream);shell();},onError(error){errors.push(error);}});
  try{
    await ready;await new Promise(resolve=>setImmediate(resolve));
    expect(html).toContain('正文先于慢资料可用');expect(html).toContain('正在读取创作素材与资料');
    expect(html).not.toContain('迟到的资料');
    finish({ammo:[{id:'k',linkId:'link',title:'迟到的资料',kind:'knowledge',sourceLabel:'手记',previewUrl:null}],ammoReadError:null});
    await ended;expect(html).toContain('迟到的资料');expect(errors).toEqual([]);
  }finally{rendering.abort();}
});
