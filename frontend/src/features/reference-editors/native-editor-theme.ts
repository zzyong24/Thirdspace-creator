'use client';
import * as React from 'react';
import type {NativeEditorTheme} from './native-editor-contract';

const names = ['canvas', 'surface', 'surface-subtle', 'brand', 'brand-hover', 'brand-soft', 'brand-foreground', 'text', 'text-muted', 'text-subtle', 'border', 'border-strong', 'success', 'warning', 'danger', 'info', 'radius-control', 'radius-card', 'radius-panel', 'shadow-card', 'shadow-popover', 'font-sans', 'text-xs', 'text-sm', 'text-md'];
export function readNativeEditorTheme(): NativeEditorTheme {
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  const tokens = Object.fromEntries(names.map(name => {
    const key = `--creatoros-${name}`;
    return [key, computed.getPropertyValue(key).trim()];
  }));
  return {mode: root.classList.contains('dark') ? 'dark' : 'light', tokens, fontFamily: tokens['--creatoros-font-sans'], fontSize: tokens['--creatoros-text-sm'], density: root.dataset.density ?? 'comfortable'};
}
export function applyNativeEditorTheme(element: HTMLElement, theme: NativeEditorTheme) {
  for (const [name, value] of Object.entries(theme.tokens)) element.style.setProperty(name, value);
  element.dataset.theme = theme.mode;
  element.dataset.density = theme.density;
  element.style.colorScheme = theme.mode;
  element.style.fontFamily = theme.fontFamily;
  element.style.fontSize = theme.fontSize;
}
export function useNativeEditorTheme() {
  const [theme, setTheme] = React.useState<NativeEditorTheme | null>(null);
  React.useEffect(() => {
    const refresh = () => setTheme(readNativeEditorTheme());
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class', 'data-theme', 'data-density', 'style']});
    return () => observer.disconnect();
  }, []);
  return theme;
}
