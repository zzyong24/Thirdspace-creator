import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it,vi } from 'vitest';
vi.mock('@/lib/contract-client.server',()=>({client:{}}));
vi.mock('@/features/automations/automations-island',()=>({AutomationsIsland:({jobs}:{jobs:{id:string}[]})=><div>{jobs.map(j=><span key={j.id}>{j.id}</span>)}</div>}));
import { AutomationsPage } from './automations-page';
import type { ScheduledJobResource } from '@creatoros/backend/modules/scheduling';
it('已迁移的旧同步隐藏，未迁移评论仍可管理，统一作业保留',async()=>{
 const jobs=[{id:'unified',sourceKind:'self.metrics',target:{operationsSync:{version:1}}},{id:'merged-comments',sourceKind:'comments',target:{mergedIntoSelfMetrics:true}},{id:'legacy-comments',sourceKind:'comments',target:{}},{id:'merged-traffic',sourceKind:'self.traffic',target:{mergedIntoSelfMetrics:true}}] as ScheduledJobResource[];
 const html=renderToStaticMarkup(await AutomationsPage({jobs}));
 expect(html).toContain('unified');expect(html).toContain('legacy-comments');expect(html).not.toContain('merged-comments');expect(html).not.toContain('merged-traffic');
});
