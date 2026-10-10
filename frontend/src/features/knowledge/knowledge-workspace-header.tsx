import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Library, Network, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 同一知识目的地的导航，链接只携带目标视图参数。 */
export function KnowledgeWorkspaceHeader({
  activeView,
  action,
}: {
  activeView: "library" | "advanced" | "course";
  action?: ReactNode;
}) {
  return (
    <header className="shrink-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">知识库</h1>
          <p className="mt-1 text-sm text-muted-foreground">把资料与创作经验，留给下一次创作。</p>
        </div>
        {action ?? (
          <Button asChild>
            <Link href="/knowledge?add=1"><Plus />添加资料</Link>
          </Button>
        )}
      </div>
      <nav aria-label="知识库视图" className="flex flex-wrap gap-1 border-b border-border">
        {[
          { id: "library", href: "/knowledge", label: "资料库", icon: Library },
          { id: "advanced", href: "/knowledge?view=advanced", label: "经验与关联", icon: Network },
          { id: "course", href: "/knowledge?view=course", label: "IP 实战课", icon: BookOpen },
        ].map(({ id, href, label, icon: Icon }) => (
          <Link key={id} href={href} aria-current={activeView === id ? "page" : undefined}
            className={"inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (activeView === id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:bg-surface-subtle hover:text-foreground")}>
            <Icon className="size-4" />{label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
