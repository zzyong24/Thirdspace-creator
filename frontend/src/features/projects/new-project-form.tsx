"use client";

/**
 * `NewProjectForm` is the body content for the `/projects/new` overlay
 * and its full-page fallback (Task 11).
 *
 * Contract (locked by `new-project-form.test.tsx`):
 *  - five fields render in the spec order: Project Name → Project Brief
 *    → Target Platform → Content Type → Creation Mode,
 *  - the Project Name field is `required` and the Create button is
 *    disabled until a non-empty trimmed name is present,
 *  - the platform, content type and creation mode selectors are
 *    horizontal radio-card grids; every card is reachable by Tab and
 *    activated by Enter or Space,
 *  - the footer exposes a Cancel button, the EnterAfterCreate checkbox
 *    and the primary Create button,
 *  - Create calls `onCreate(values)` and resets the form (local success
 *    transition — no network calls),
 *  - Cancel calls `onCancel()` without firing `onCreate`,
 *  - the component consumes tokens only (no hard-coded colours or
 *    dimensions).
 *
 * Routing, the backdrop mask, focus trap and Escape-to-close are owned
 * by `components/overlays/new-project-dialog.tsx` (Task 8) — this
 * component is a pure form that can be mounted inside either the modal
 * overlay or the full-page fallback.
 */

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ContentType, CreationMode, PlatformId } from "@/types/domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NewProjectFormValues {
  readonly name: string;
  readonly brief: string;
  readonly platforms: ReadonlyArray<PlatformId>;
  readonly contentType: ContentType;
  readonly creationMode: CreationMode;
  readonly enterAfterCreate: boolean;
}

export interface NewProjectFormProps {
  /** Initial values used when the dialog re-opens with state to restore. */
  readonly defaultValues?: Partial<NewProjectFormValues>;
  /** Fired when the user clicks Create with a valid name. */
  readonly onCreate: (values: NewProjectFormValues) => void;
  /** Fired when the user clicks Cancel. */
  readonly onCancel: () => void;
  /** Optional className for the form root. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Option catalogues
// ---------------------------------------------------------------------------

interface PlatformOption {
  readonly id: PlatformId;
  readonly label: string;
  readonly hint: string;
}

interface RadioOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly description?: string;
  readonly badge?: string;
}

const PLATFORM_OPTIONS: ReadonlyArray<PlatformOption> = [
  { id: "douyin", label: "抖音", hint: "竖屏短视频" },
  { id: "bilibili", label: "B站", hint: "中长视频" },
  { id: "xiaohongshu", label: "小红书", hint: "图文 / 短视频" },
  { id: "wechatVideo", label: "视频号", hint: "微信生态" },
  { id: "youtube", label: "YouTube", hint: "海外长视频" },
  { id: "x", label: "X", hint: "图文 / 短贴" },
];

const CONTENT_TYPE_OPTIONS: ReadonlyArray<RadioOption<ContentType>> = [
  { value: "video", label: "视频", description: "长 / 短片视频" },
  { value: "image", label: "图文", description: "图文卡片 / 长图" },
  { value: "audio", label: "音频", description: "播客 / 配音" },
  { value: "article", label: "长文", description: "公众号 / 专栏" },
];

const CREATION_MODE_OPTIONS: ReadonlyArray<RadioOption<CreationMode>> = [
  {
    value: "guided",
    label: "推荐",
    description: "AI 引导的 5 步流程",
    badge: "推荐",
  },
  {
    value: "flexible",
    label: "省心",
    description: "自定义阶段模板",
    badge: "省心",
  },
  {
    value: "freeform",
    label: "自由",
    description: "完全自定义",
    badge: "自由",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMPTY_DEFAULTS: NewProjectFormValues = {
  name: "",
  brief: "",
  platforms: [],
  contentType: "video",
  creationMode: "guided",
  enterAfterCreate: true,
};

export function NewProjectForm({
  defaultValues,
  onCreate,
  onCancel,
  className,
}: NewProjectFormProps) {
  // Hold the form state in a single object so the reset path is a single
  // setter call (no juggling of useState for each field).
  const initial = React.useMemo<NewProjectFormValues>(
    () => ({
      ...EMPTY_DEFAULTS,
      ...defaultValues,
    }),
    [defaultValues],
  );

  const [values, setValues] = React.useState<NewProjectFormValues>(initial);
  // Keep a ref to the latest callback so the form does not capture stale
  // closures across renders.
  const onCreateRef = React.useRef(onCreate);
  React.useEffect(() => {
    onCreateRef.current = onCreate;
  }, [onCreate]);

  const trimmedName = values.name.trim();
  const canCreate = trimmedName.length > 0;

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canCreate) return;
      onCreateRef.current({
        ...values,
        name: trimmedName,
      });
      // Local success transition: reset the form so the next mount starts
      // clean. The parent is expected to close the dialog.
      setValues(EMPTY_DEFAULTS);
    },
    [canCreate, trimmedName, values],
  );

  const handleCancel = React.useCallback(() => {
    // Reset to the last `defaultValues` snapshot so a re-open shows a
    // fresh form without leaking previous input.
    setValues(initial);
    onCancel();
  }, [initial, onCancel]);

  return (
    <form
      data-slot="new-project-form"
      data-form="new-project"
      noValidate
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-4", className)}
    >
      <ProjectNameField
        name={values.name}
        onChange={(name) => setValues((prev) => ({ ...prev, name }))}
      />
      <ProjectBriefField
        brief={values.brief}
        onChange={(brief) => setValues((prev) => ({ ...prev, brief }))}
      />
      <TargetPlatformSelector
        value={values.platforms}
        onChange={(platforms) =>
          setValues((prev) => ({ ...prev, platforms }))
        }
      />
      <ContentTypeSelector
        value={values.contentType}
        onChange={(contentType) =>
          setValues((prev) => ({ ...prev, contentType }))
        }
      />
      <CreationModeSelector
        value={values.creationMode}
        onChange={(creationMode) =>
          setValues((prev) => ({ ...prev, creationMode }))
        }
      />
      <DialogHint />
      <FormFooter
        enterAfterCreate={values.enterAfterCreate}
        canCreate={canCreate}
        onEnterAfterCreateChange={(enterAfterCreate) =>
          setValues((prev) => ({ ...prev, enterAfterCreate }))
        }
        onCancel={handleCancel}
      />
    </form>
  );
}

export default NewProjectForm;

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

interface ProjectNameFieldProps {
  readonly name: string;
  readonly onChange: (next: string) => void;
}

function ProjectNameField({ name, onChange }: ProjectNameFieldProps) {
  return (
    <div
      data-slot="new-project-name"
      data-testid="new-project-name"
      data-name="name"
      className="grid gap-2"
    >
      <label
        htmlFor="new-project-name-input"
        className="text-sm font-medium text-foreground"
      >
        项目名称
        <span aria-hidden="true" className="ml-1 text-destructive">
          *
        </span>
      </label>
      <Input
        id="new-project-name-input"
        name="name"
        type="text"
        value={name}
        onChange={(event) => onChange(event.target.value)}
        required
        aria-required="true"
        placeholder="例如：AI Native Browser 深度解析"
        autoComplete="off"
        data-slot="new-project-name-input"
      />
    </div>
  );
}

interface ProjectBriefFieldProps {
  readonly brief: string;
  readonly onChange: (next: string) => void;
}

function ProjectBriefField({ brief, onChange }: ProjectBriefFieldProps) {
  return (
    <div
      data-slot="new-project-brief"
      data-testid="new-project-brief"
      data-name="brief"
      className="grid gap-2"
    >
      <label
        htmlFor="new-project-brief-input"
        className="text-sm font-medium text-foreground"
      >
        项目简介
      </label>
      <Textarea
        id="new-project-brief-input"
        name="brief"
        value={brief}
        onChange={(event) => onChange(event.target.value)}
        placeholder="一句话描述这次想做的内容（可选）"
        rows={3}
        data-slot="new-project-brief-input"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radio card groups
// ---------------------------------------------------------------------------

interface RadioCardGroupProps<TValue extends string> {
  readonly testId: string;
  readonly name: string;
  readonly legend: string;
  readonly options: ReadonlyArray<RadioOption<TValue>>;
  readonly value: TValue;
  readonly onChange: (next: TValue) => void;
  /** Optional card description formatter. */
  readonly renderOption?: (option: RadioOption<TValue>) => React.ReactNode;
}

function RadioCardGroup<TValue extends string>({
  testId,
  name,
  legend,
  options,
  value,
  onChange,
  renderOption,
}: RadioCardGroupProps<TValue>) {
  return (
    <fieldset
      data-slot="new-project-radio-group"
      data-testid={testId}
      data-name={name}
      className="grid gap-2"
    >
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <div
        role="radiogroup"
        aria-label={legend}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <RadioCard
              key={option.value}
              name={name}
              value={option.value}
              checked={checked}
              onSelect={() => onChange(option.value)}
            >
              {renderOption ? renderOption(option) : option.label}
            </RadioCard>
          );
        })}
      </div>
    </fieldset>
  );
}

interface RadioCardProps {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onSelect: () => void;
  readonly children: React.ReactNode;
}

const RadioCard = React.forwardRef<HTMLInputElement, RadioCardProps>(
  function RadioCard({ name, value, checked, onSelect, children }, ref) {
    // Use a hidden native radio so screen readers + keyboard semantics
    // (Arrow keys, Space, Enter) work out of the box, and style a
    // visible label around it. Clicking the label fires a `change` event
    // on the radio, which we forward to the parent via `onSelect`.
    //
    // We add a `keydown` handler on the wrapping label so that pressing
    // Enter (which the browser does not treat as a radio toggle) also
    // activates the card. The native Space-to-check behaviour still
    // works because the focused radio receives the keydown.
    const id = `${name}-${value}`;
    const handleKeyDown = (event: React.KeyboardEvent<HTMLLabelElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSelect();
      }
    };
    return (
      <label
        htmlFor={id}
        data-slot="new-project-radio-card"
        data-checked={checked ? "true" : "false"}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
          "focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-2 focus-within:ring-offset-popover",
          checked
            ? "border-primary bg-primary/5"
            : "border-border bg-background hover:bg-muted/50",
        )}
      >
        <input
          ref={ref}
          id={id}
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onSelect}
          className="sr-only"
          data-slot="new-project-radio-input"
        />
        {children}
      </label>
    );
  },
);

// ---------------------------------------------------------------------------
// Concrete selectors
// ---------------------------------------------------------------------------

interface TargetPlatformSelectorProps {
  readonly value: ReadonlyArray<PlatformId>;
  readonly onChange: (next: ReadonlyArray<PlatformId>) => void;
}

function TargetPlatformSelector({
  value,
  onChange,
}: TargetPlatformSelectorProps) {
  // The selector is a horizontal radio card grid in the UI, but the
  // underlying domain is `ReadonlyArray<PlatformId>` so a project can
  // target multiple platforms. The selector is therefore rendered as
  // toggle cards (one selection at a time) for the initial creation step
  // — the multi-platform management lives in the project workspace.
  //
  // For this dialog we model the field as a single-selection radio group
  // whose value is stored in a one-element array. This keeps the
  // keyboard semantics clean (radio, not checkbox) and matches the
  // screenshot's "select one to start" affordance.
  const current = value[0] ?? "bilibili";
  return (
    <RadioCardGroup
      testId="new-project-platform"
      name="target-platform"
      legend="目标平台"
      value={current}
      onChange={(next) => onChange([next])}
      options={PLATFORM_OPTIONS.map((p) => ({
        value: p.id,
        label: p.label,
        description: p.hint,
      }))}
      renderOption={(option) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {option.label}
          </span>
          {option.description ? (
            <span className="text-xs text-muted-foreground">
              {option.description}
            </span>
          ) : null}
        </div>
      )}
    />
  );
}

interface ContentTypeSelectorProps {
  readonly value: ContentType;
  readonly onChange: (next: ContentType) => void;
}

function ContentTypeSelector({ value, onChange }: ContentTypeSelectorProps) {
  return (
    <RadioCardGroup
      testId="new-project-content-type"
      name="content-type"
      legend="内容类型"
      value={value}
      onChange={onChange}
      options={CONTENT_TYPE_OPTIONS}
      renderOption={(option) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {option.label}
          </span>
          {option.description ? (
            <span className="text-xs text-muted-foreground">
              {option.description}
            </span>
          ) : null}
        </div>
      )}
    />
  );
}

interface CreationModeSelectorProps {
  readonly value: CreationMode;
  readonly onChange: (next: CreationMode) => void;
}

function CreationModeSelector({ value, onChange }: CreationModeSelectorProps) {
  return (
    <RadioCardGroup
      testId="new-project-creation-mode"
      name="creation-mode"
      legend="创作模式"
      value={value}
      onChange={onChange}
      options={CREATION_MODE_OPTIONS}
      renderOption={(option) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              {option.label}
            </span>
            {option.badge ? (
              <span
                data-slot="new-project-radio-badge"
                data-badge={option.badge}
                className="rounded-full border border-border bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {option.badge}
              </span>
            ) : null}
          </div>
          {option.description ? (
            <span className="text-xs text-muted-foreground">
              {option.description}
            </span>
          ) : null}
        </div>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Hint + footer
// ---------------------------------------------------------------------------

function DialogHint() {
  return (
    <p
      data-slot="new-project-hint"
      className="text-xs text-muted-foreground"
    >
      提示：项目创建后可继续在「项目工作区」补充更多平台与阶段细节。
    </p>
  );
}

interface FormFooterProps {
  readonly enterAfterCreate: boolean;
  readonly canCreate: boolean;
  readonly onEnterAfterCreateChange: (next: boolean) => void;
  readonly onCancel: () => void;
}

function FormFooter({
  enterAfterCreate,
  canCreate,
  onEnterAfterCreateChange,
  onCancel,
}: FormFooterProps) {
  return (
    <div
      data-slot="new-project-footer"
      data-testid="new-project-footer"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
    >
      <label
        htmlFor="new-project-enter-after-create"
        data-testid="new-project-enter-after-create"
        className="flex items-center gap-2 text-xs text-muted-foreground"
      >
        <Checkbox
          id="new-project-enter-after-create"
          checked={enterAfterCreate}
          onCheckedChange={(value) =>
            onEnterAfterCreateChange(value === true)
          }
        />
        创建后进入工作区
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          data-slot="new-project-cancel"
        >
          取消
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={!canCreate}
          data-slot="new-project-submit"
        >
          创建
        </Button>
      </div>
    </div>
  );
}
