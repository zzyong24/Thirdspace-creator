const MAX_REMEMBERED_APPROVALS = 256;

type ApprovalResumeMessage = {
  role: string;
  parts: Array<{
    type: string;
    state?: string;
    approval?: {
      id?: string;
      approved?: boolean;
      reason?: string;
      signature?: string;
    };
  }>;
};

/**
 * [T-736] ai@7.0.4 的 addToolApprovalResponse 会把 approval 对象替换为
 * `{ id, approved, reason }`，因此服务端签发的 HMAC signature 在续跑请求中丢失。
 *
 * 只在网络请求副本上按 approvalId 恢复先前收到的签名；不修改界面状态，也不接受未知签名。
 * 后端仍会校验签名绑定的 toolCallId、工具名与精确输入，随后再消费一次性审批账本。
 */
export function restoreToolApprovalSignatures<T extends ApprovalResumeMessage>(
  messages: T[],
  signatures: ReadonlyMap<string, string>,
): T[] {
  return messages.map((message) => {
    let changed = false;
    const parts = message.parts.map((part) => {
      const approvalId = part.approval?.id ?? "";
      const signature = approvalId ? signatures.get(approvalId) : undefined;
      if (!signature || part.approval?.signature === signature) return part;
      changed = true;
      return {
        ...part,
        approval: { ...part.approval, signature },
      };
    });
    return changed ? ({ ...message, parts } as T) : message;
  });
}

/**
 * [T-673] AI SDK 的授权恢复谓词在“续跑流在 tool-output 前损坏”时仍会持续返回 true：
 * 末条 assistant 还停在 approval-responded，useChat 因而会再次提交同一轮，最终形成请求风暴。
 *
 * 这里在官方完整性判断外加一个本机一次性熔断：每个 approval id 最多自动续跑一次。正常
 * tool-output 会把 part 推进终态，不受影响；畸形流则停在可见错误态，交给用户显式重试，禁止
 * 后台无限重发。Set 由组件会话实例持有，不跨用户/窗口共享。
 */
export function shouldResumeToolApprovalOnce<T extends ApprovalResumeMessage>(
  messages: T[],
  attemptedApprovalIds: Set<string>,
  isCompleteWithApprovalResponses: (input: { messages: T[] }) => boolean,
): boolean {
  if (!isCompleteWithApprovalResponses({ messages })) {
    return false;
  }

  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;

  const lastStepStart = last.parts.reduce(
    (index, part, current) => (part.type === "step-start" ? current : index),
    -1,
  );
  const approvalIds = last.parts
    .slice(lastStepStart + 1)
    .filter((part) => part.state === "approval-responded")
    .map((part) => part.approval?.id ?? "")
    .filter(Boolean);

  if (
    approvalIds.length === 0 ||
    approvalIds.every((id) => attemptedApprovalIds.has(id))
  ) {
    return false;
  }

  for (const id of approvalIds) attemptedApprovalIds.add(id);
  while (attemptedApprovalIds.size > MAX_REMEMBERED_APPROVALS) {
    const oldest = attemptedApprovalIds.values().next().value as
      | string
      | undefined;
    if (!oldest) break;
    attemptedApprovalIds.delete(oldest);
  }
  return true;
}
