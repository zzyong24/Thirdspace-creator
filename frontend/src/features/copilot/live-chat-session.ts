import { Chat } from '@ai-sdk/react';
import type { ChatTransport, UIMessage } from 'ai';
import { createChatTaskControl } from './chat-task-control';

type Session = {
  chat: Chat<UIMessage>;
  control: ReturnType<typeof createChatTaskControl>;
  conversationId: string | null;
  epoch: number;
  transport?: ChatTransport<UIMessage>;
  shouldResume?: (input: {messages: UIMessage[]}) => boolean;
  observers: number;
  disposeListeners?: () => void;
};
// 只在当前窗口保存交互会话，不替代服务端账本。账号与入口隔离，切页不销毁在途回复。
const sessions = new Map<string, Session>();
const MAX_IDLE_SESSIONS = 16;
const MAX_IDLE_MESSAGE_BYTES = 4 * 1024 * 1024;
const PROTECTED_EXECUTION_STATES = new Set(["queued","running","retry_wait","waiting_user","unknown_result","paused","awaiting_confirmation","pause_requested","cancel_requested"]);
let pruneQueued = false;

function protectedSession(session: Session): boolean {
  if (session.observers || ["submitted", "streaming"].includes(session.chat.status)) return true;
  const last = session.chat.messages.at(-1);
  const execution = (last?.metadata as {execution?:{executionTaskId?:unknown;status?:unknown}} | undefined)?.execution;
  // 只信与本轮真实响应头回执相同的任务状态，不从 error 文案猜测等待状态。
  if (last?.role === "assistant" && typeof execution?.executionTaskId === "string" && execution.executionTaskId.length > 0 && execution.executionTaskId === session.control.executionTaskId && typeof execution.status === "string" && PROTECTED_EXECUTION_STATES.has(execution.status)) return true;
  return (last?.parts ?? []).some(part => {
    const tool = part as {state?:string; approval?:{approved?:boolean}; output?:unknown};
    if (tool.state === "approval-requested" || (tool.state === "approval-responded" && tool.approval?.approved === true)) return true;
    const output = tool.output as {runtimeStatus?:string;status?:string;task?:{runtimeStatus?:string;status?:string}} | undefined;
    const state = output?.runtimeStatus ?? output?.task?.runtimeStatus ?? output?.status ?? output?.task?.status;
    // 只依据协议中的执行状态保护原会话，不做内容或创作语义判断。
    return typeof state === "string" && PROTECTED_EXECUTION_STATES.has(state);
  });
}

function pruneLiveChatSessions(except?: Session): void {
  const idle = [...sessions.entries()].filter(([,session]) => !protectedSession(session));
  let bytes = idle.reduce((sum,[,session]) => sum + JSON.stringify(session.chat.messages).length * 2, 0);
  let count = idle.length;
  for (const [key,session] of idle) {
    if (count <= MAX_IDLE_SESSIONS && bytes <= MAX_IDLE_MESSAGE_BYTES) break;
    if (session === except) continue;
    bytes -= JSON.stringify(session.chat.messages).length * 2; count -= 1;
    sessions.delete(key);
    session.disposeListeners?.(); session.disposeListeners = undefined;
    session.transport = undefined; session.shouldResume = undefined;
    session.control.release(); session.chat.messages = [];
  }
}

function queuePrune() {
  if (pruneQueued) return;
  pruneQueued = true;
  queueMicrotask(() => {pruneQueued = false; pruneLiveChatSessions();});
}

/** 挂载是观察者归属；离开页面不停止原流，完成后的闲置会话才可淘汰。 */
export function acquireLiveChatSession(key: string, session: Session): () => void {
  sessions.delete(key); sessions.set(key, session);
  session.observers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true; session.observers -= 1;
    // StrictMode 的清理/重挂在同一轮发生，不能清理刚重新取得归属的会话。
    queuePrune();
  };
}

export function getLiveChatSession(key: string): Session {
  const existing = typeof window !== 'undefined' ? sessions.get(key) : undefined;
  if (existing) { sessions.delete(key); sessions.set(key,existing); pruneLiveChatSessions(existing); return existing; }
  const session = { control: createChatTaskControl(), conversationId: null, epoch: 0, observers: 0 } as Session;
  session.chat = new Chat<UIMessage>({
    id: key,
    transport: {
      sendMessages: options => {
        if (!session.transport) throw new Error('聊天连接尚未就绪');
        return session.transport.sendMessages(options);
      },
      reconnectToStream: options => {
        if (!session.transport) throw new Error('聊天连接尚未就绪');
        return session.transport.reconnectToStream(options);
      },
    },
    sendAutomaticallyWhen: input => session.shouldResume?.(input) ?? false,
  });
  if (typeof window !== 'undefined') {
    const offMessages = session.chat['~registerMessagesCallback'](queuePrune);
    const offStatus = session.chat['~registerStatusCallback'](queuePrune);
    session.disposeListeners = () => {offMessages();offStatus();};
    sessions.set(key, session); pruneLiveChatSessions(session);
  }
  return session;
}
