import {readAssistantEngine,type AssistantEngine} from './assistant-engine';
import { createChatTaskControl } from './chat-task-control';

export type LiveChatSession<TChat, TTransport, TMessage> = {
  chat: TChat;
  control: ReturnType<typeof createChatTaskControl>;
  conversationId: string | null;
  epoch: number;
  executionEngine:AssistantEngine;
  sourceEngines:Map<string,AssistantEngine>;
  transport?: TTransport;
  shouldResume?: (input: {messages: TMessage[]}) => boolean;
};
// 只在当前窗口保存交互会话，不替代服务端账本。账号与入口隔离，切页不销毁在途回复。
const sessions = new Map<string, object>();
export function getLiveChatSession<TChat, TTransport, TMessage>(
  key: string,
  createChat: (session: LiveChatSession<TChat, TTransport, TMessage>) => TChat,
): LiveChatSession<TChat, TTransport, TMessage> {
  const existing = typeof window !== 'undefined'
    ? sessions.get(key) as LiveChatSession<TChat, TTransport, TMessage> | undefined
    : undefined;
  if (existing) return existing;
  const session = { control: createChatTaskControl(), conversationId: null, epoch: 0, executionEngine:readAssistantEngine(), sourceEngines:new Map<string,AssistantEngine>() } as
    LiveChatSession<TChat, TTransport, TMessage>;
  session.chat = createChat(session);
  if (typeof window !== 'undefined') sessions.set(key, session);
  return session;
}
