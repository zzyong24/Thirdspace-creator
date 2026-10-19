"use client";
import { OwnedDevicePanel } from "@/app/activate/owned-device-panel";
export function OwnedDeviceConnection({ visible }: { visible: boolean }): React.JSX.Element | null {
  if (!visible) return null;
  return <OwnedDevicePanel intent="link_owner" hideUnavailable />;
}
