/**
 * 稿面顶条主行动(T-076 两阶段化,SPEC §2 [gate-F1])。
 *
 * 原「定稿,进制作 →」指向已删除的制作台,按状态收敛:
 *   未发布(发布包无 published 行)→ 不渲染(返回 null,顶条只剩「在 Finder 打开」;
 *     此态的可执行入口都在稿面内:脚本编辑、发布包区「先盲预测」「登记已发布」);
 *   已登记发布 → 「看复盘 →」链接到复盘页。
 *
 * 纯 Link,无 transition 副作用(transitionProjectStage op 保留但本按钮不再调用),
 * Server Component 可直接渲染。
 */

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function DraftPrimaryAction({
  projectId,
  published,
}: {
  readonly projectId: string;
  /** 发布包里是否已有 published 行(由 publishPack.status 派生,数据在稿面 VM)。 */
  readonly published: boolean;
}) {
  if (!published) return null;
  return (
    <Link
      href={`/projects/${projectId}/review`}
      data-slot="draft-primary-action"
      className={buttonVariants({ size: "sm" })}
    >
      看复盘 →
    </Link>
  );
}
