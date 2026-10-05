import type { PlatformId, RenderContext } from "../types";

export interface PlatformAdapter {
  id: PlatformId;
  label: string;
  render(context: RenderContext): HTMLElement;
  copy(context: RenderContext, root: HTMLElement): Promise<string>;
}
