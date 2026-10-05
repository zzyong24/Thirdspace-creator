import type { App } from "obsidian";

interface AppWithSettings extends App {
  setting: {
    open(): void;
    openTabById(id: string): void;
  };
}

export function openPluginSettings(app: App, pluginId: string): void {
  const settings = (app as AppWithSettings).setting;
  settings.open();
  settings.openTabById(pluginId);
}
