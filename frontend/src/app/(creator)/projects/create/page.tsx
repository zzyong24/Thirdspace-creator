import { QuickCreateWork } from "@/features/projects/quick-create-work";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function CreateWorkPage({ searchParams }: { searchParams?: Promise<{ sourceItemId?: string }> }) {
  const session = await resolveSession();
  const requestedSourceId = (await searchParams)?.sourceItemId;
  let accountPlatform: string | null = null;
  let sourceItemId: string | undefined;
  let sourceTitle: string | undefined;
  let sourceType: "video" | "article" | "trend_signal" | undefined;
  let sourceNotice: string | undefined;
  if (session?.ctx.accountId) {
    const scoped = createServerClient(session.ctx);
    try {
      const account = await scoped.getAccount({ params: { accountId: session.ctx.accountId }, query: undefined, body: undefined });
      accountPlatform = account.platform;
    } catch { /* 账号平台缺失时仍允许用户自行选作品形式。 */ }
    if (requestedSourceId) {
      try {
        const source = await scoped.getIntelligenceItem({ params: { itemId: requestedSourceId }, query: undefined, body: undefined });
        sourceItemId = source.item.id;
        sourceTitle = source.item.title || "这条内容";
        sourceType = source.item.type;
      } catch {
        sourceNotice = "所选雷达来源暂不可读取。仍可输入主题直接创作，作品不会附上未经核验的来源。";
      }
    }
  }
  return <QuickCreateWork accountId={session?.ctx.accountId} accountPlatform={accountPlatform}
    sourceItemId={sourceItemId} sourceTitle={sourceTitle} sourceType={sourceType} sourceNotice={sourceNotice} />;
}
