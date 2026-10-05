"use client";

import {SectionCard} from "@/components/project/section-card";
import {AssistantEngineSelector} from "@/features/copilot/assistant-engine-selector";
import {SettingsFormRow} from "./settings-form-row";

export function AssistantEngineCard() {
  return <div data-slot="assistant-engine-card" data-highlight="assistant-engine">
    <SectionCard title="编导引擎" description="设置编导对话使用的引擎，后续新消息按此执行。">
      <SettingsFormRow label="使用引擎" controlId="assistant-engine"
        help="本地保存。正在进行的回复和旧消息重试沿用原引擎。">
        <AssistantEngineSelector />
      </SettingsFormRow>
    </SectionCard>
  </div>;
}
