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
};
// 只在当前窗口保存交互会话，不替代服务端账本。账号与入口隔离，切页不销毁在途回复。
const sessions = new Map<string, Session>();
export function getLiveChatSession(key: string): Session {
  const existing = typeof window !== 'undefined' ? sessions.get(key) : undefined;
  if (existing) return existing;
  const session = { control: createChatTaskControl(), conversationId: null, epoch: 0 } as Session;
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
  if (typeof window !== 'undefined') sessions.set(key, session);
  return session;
}
