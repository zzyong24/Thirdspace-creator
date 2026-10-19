import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {DraftChatRequestProvider} from '@/features/draft-workbench/draft-chat-request';
import {OverlayController} from '@/components/overlays/overlay-controller';
import {AICopilotDialog} from '@/components/overlays/ai-copilot-dialog';
import {scenario} from './state';
import '@fontsource-variable/noto-sans-sc';
createRoot(document.getElementById('root')!).render(<><aside className="global-harness-boundary">真实共享全局槽位 · 组件隔离 harness · 非生产/安装验收 · {scenario}</aside><DraftChatRequestProvider><OverlayController><AICopilotDialog pathname="/"/></OverlayController></DraftChatRequestProvider></>);
