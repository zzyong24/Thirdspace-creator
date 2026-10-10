import { notFound } from 'next/navigation';
import { resolveSession } from '@/lib/session.server';
import { createServerClient } from '@/lib/contract-client.server';
import { buildKnowledgeDashboardViewModel, type KnowledgeDataClient } from '@/features/knowledge/knowledge-data';
import { KnowledgeCandidates } from './candidates';
export default async function Preview({searchParams}:{searchParams:Promise<Record<string,string>>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const session=await resolveSession();if(!session?.ctx.accountId&&!session?.ctx.groupId)notFound();
 const vm=await buildKnowledgeDashboardViewModel(createServerClient(session!.ctx) as unknown as KnowledgeDataClient);
 const {variant}=await searchParams;
 return <KnowledgeCandidates vm={vm} variant={variant==='b'?'b':'a'}/>;
}
