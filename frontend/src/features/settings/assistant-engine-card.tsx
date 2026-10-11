"use client";

import {SectionCard} from "@/components/project/section-card";
import {AssistantEngineSelector} from "@/features/copilot/assistant-engine-selector";
import {SettingsFormRow} from "./settings-form-row";

export function AssistantEngineCard() {
  return <div data-slot="assistant-engine-card" data-highlight="assistant-engine">
    <SectionCard title="执行引擎" description="新创作、编导对话和后台任务使用同一引擎。">
      <SettingsFormRow label="使用引擎" controlId="assistant-engine"
        help="保存后对新任务生效。在途任务与原任务恢复沿用已选引擎。">
        <AssistantEngineSelector />
      </SettingsFormRow>
    </SectionCard>
  </div>;
}
