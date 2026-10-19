import React from 'react';
import { createRoot } from 'react-dom/client';
import { OwnedDevicePanel } from '@/app/activate/owned-device-panel';
import '@/app/globals.css';
const intent = new URLSearchParams(location.search).get('intent') === 'link_owner' ? 'link_owner' : 'register_device';
createRoot(document.getElementById('root')!).render(<main className="flex min-h-screen items-center justify-center bg-background px-4"><div className="flex w-full max-w-md flex-col gap-6 rounded-xl bg-card p-4 sm:p-8 text-card-foreground ring-1 ring-foreground/10"><OwnedDevicePanel intent={intent}/></div></main>);
