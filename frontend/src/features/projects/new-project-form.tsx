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
 *  - Create calls `onCreate(values)` (which may be async). While the
 *    promise is pending the Create/Cancel buttons disable and Create shows
 *    「创建中…」; on success the form resets (local success transition);
 *    on rejection an inline `role="alert"` error renders and the form
 *    values are preserved (user input is never dropped),
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
import type { CreationMode } from "@/types/domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NewProjectFormValues {
  readonly name: string;
  readonly brief: string;
  // [T-052 裁决④] 宪法 §8:项目创建唯一的形态区分 = 横竖屏。contentType(视频/
  // 图文/音频)与项目层目标平台按宪法裁掉(平台归属发布层)。
  readonly orientation: "portrait" | "landscape";
  readonly creationMode: CreationMode;
  readonly enterAfterCreate: boolean;
}

export interface NewProjectFormProps {
  /** Initial values used when the dialog re-opens with state to restore. */
  readonly defaultValues?: Partial<NewProjectFormValues>;
  /**
   * Fired when the user clicks Create with a valid name. May return a
   * promise — the form awaits it to drive loading/error state. A rejected
   * promise surfaces an inline error and preserves the user's input.
   */
  readonly onCreate: (
    values: NewProjectFormValues,
  ) => void | Promise<void>;
  /** Fired when the user clicks Cancel. */
  readonly onCancel: () => void;
  /** Optional className for the form root. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Option catalogues
// ---------------------------------------------------------------------------

interface RadioOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly description?: string;
  readonly badge?: string;
}

// [T-052 裁决④] 画幅是宪法允许的唯一形态区分:竖屏(抖音优先)默认。
const ORIENTATION_OPTIONS: ReadonlyArray<RadioOption<"portrait" | "landscape">> = [
  { value: "portrait", label: "竖屏 9:16", description: "抖音 / 短视频优先" },
  { value: "landscape", label: "横屏 16:9", description: "B 站 / 长视频" },
];

const CREATION_MODE_OPTIONS: ReadonlyArray<RadioOption<CreationMode>> = [
  {
    value: "guided",
    label: "AI 全流程创作",
    description: "AI 帮你完成从选题到发布的全部工作",
    badge: "省心",
  },
  {
    value: "flexible",
    label: "AI 协作创作",
    description: "你主导创作，AI 提供建议和辅助",
    badge: "推荐",
  },
  {
    value: "freeform",
    label: "手动创作",
    description: "完全由你掌控每一个创作环节",
    badge: "自由",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMPTY_DEFAULTS: NewProjectFormValues = {
  name: "",
  brief: "",
  orientation: "portrait",
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
  // Submission lifecycle: idle -> submitting -> (idle on success | error on
  // reject). `errorMsg` carries the inline alert text; values are never reset
  // on error so the user keeps their input.
  const [status, setStatus] =
    React.useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  // Keep a ref to the latest callback so the form does not capture stale
  // closures across renders.
  const onCreateRef = React.useRef(onCreate);
  React.useEffect(() => {
    onCreateRef.current = onCreate;
  }, [onCreate]);

  const trimmedName = values.name.trim();
  const submitting = status === "submitting";
  const canCreate = trimmedName.length > 0 && !submitting;

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (trimmedName.length === 0 || submitting) return;
      setStatus("submitting");
      setErrorMsg(null);
      try {
        await onCreateRef.current({
          ...values,
          name: trimmedName,
        });
        // Local success transition: reset the form so the next mount starts
        // clean. The parent is expected to close the dialog/navigate.
        setValues(EMPTY_DEFAULTS);
        setStatus("idle");
      } catch (error) {
        // Surface the failure inline and PRESERVE the user's input — never
        // silently swallow a rejected create.
        setStatus("error");
        setErrorMsg(
          error instanceof Error && error.message
            ? error.message
            : "创建失败，请稍后重试。",
        );
      }
    },
    [submitting, trimmedName, values],
  );

  const handleCancel = React.useCallback(() => {
    if (submitting) return;
    // Reset to the last `defaultValues` snapshot so a re-open shows a
    // fresh form without leaking previous input.
    setValues(initial);
    setStatus("idle");
    setErrorMsg(null);
    onCancel();
  }, [initial, onCancel, submitting]);

  return (
    <form
      data-slot="new-project-form"
      data-form="new-project"
      noValidate
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-3.5", className)}
    >
      <ProjectNameField
        name={values.name}
        onChange={(name) => setValues((prev) => ({ ...prev, name }))}
      />
      <ProjectBriefField
        brief={values.brief}
        onChange={(brief) => setValues((prev) => ({ ...prev, brief }))}
      />
      {/* [T-052 裁决④] 内容模板与项目层目标平台按宪法 §8 裁掉;画幅是唯一形态区分。 */}
      <OrientationSelector
        value={values.orientation}
        onChange={(orientation) =>
          setValues((prev) => ({ ...prev, orientation }))
        }
      />
      <CreationModeSelector
        value={values.creationMode}
        onChange={(creationMode) =>
          setValues((prev) => ({ ...prev, creationMode }))
        }
      />
      <DialogHint />
      {status === "error" && errorMsg ? (
        <p
          role="alert"
          data-slot="new-project-error"
          className="rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
        >
          {errorMsg}
        </p>
      ) : null}
      <FormFooter
        enterAfterCreate={values.enterAfterCreate}
        canCreate={canCreate}
        submitting={submitting}
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
      data-form-section
      data-section="name"
      data-name="name"
      className="grid gap-1.5"
    >
      <label
        htmlFor="new-project-name-input"
        className="text-[13px] font-medium text-foreground"
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
      data-form-section
      data-section="brief"
      data-name="brief"
      className="grid gap-1.5"
    >
      <label
        htmlFor="new-project-brief-input"
        className="text-[13px] font-medium text-foreground"
      >
        一句话描述
      </label>
      <Textarea
        id="new-project-brief-input"
        name="brief"
        value={brief}
        onChange={(event) => onChange(event.target.value)}
        placeholder="用一句话描述你想创作的内容或解决的问题，AI 会帮你完善和拓展"
        rows={2}
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
  readonly section: string;
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
  section,
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
      data-form-section
      data-section={section}
      className="grid gap-1.5"
    >
      <legend className="text-[13px] font-medium text-foreground">{legend}</legend>
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
          "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2.5 text-left transition-colors",
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

// [T-052 裁决④] 画幅选择器 —— 宪法 §8 允许的唯一形态区分(竖屏默认)。
function OrientationSelector({
  value,
  onChange,
}: {
  readonly value: "portrait" | "landscape";
  readonly onChange: (next: "portrait" | "landscape") => void;
}) {
  return (
    <RadioCardGroup
      testId="new-project-orientation"
      name="orientation"
      section="orientation"
      legend="画幅"
      value={value}
      onChange={onChange}
      options={ORIENTATION_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        description: o.description,
      }))}
      renderOption={(option) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-foreground">
            {option.label}
          </span>
          {option.description ? (
            <span className="text-[11px] text-muted-foreground">
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
      section="creation-mode"
      legend="创作模式"
      value={value}
      onChange={onChange}
      options={CREATION_MODE_OPTIONS}
      renderOption={(option) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">
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
            <span className="text-[11px] text-muted-foreground">
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
      className="text-[11px] text-muted-foreground"
    >
      提示：项目创建后可继续在「项目工作区」补充更多平台与阶段细节。
    </p>
  );
}

interface FormFooterProps {
  readonly enterAfterCreate: boolean;
  readonly canCreate: boolean;
  readonly submitting: boolean;
  readonly onEnterAfterCreateChange: (next: boolean) => void;
  readonly onCancel: () => void;
}

function FormFooter({
  enterAfterCreate,
  canCreate,
  submitting,
  onEnterAfterCreateChange,
  onCancel,
}: FormFooterProps) {
  return (
    <div
      data-slot="new-project-footer"
      data-testid="new-project-footer"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2.5"
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
          disabled={submitting}
          data-slot="new-project-cancel"
        >
          取消
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={!canCreate}
          aria-busy={submitting}
          data-slot="new-project-submit"
        >
          {submitting ? "创建中…" : "创建"}
        </Button>
      </div>
    </div>
  );
}
