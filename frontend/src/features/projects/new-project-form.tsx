"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describeUserError } from "@/lib/ai-error-humanize";
import { isAccountRequiredError } from "@/lib/http-transport";
import { cn } from "@/lib/utils";
import { WorkTypeFields, WorkTypesFields, WORK_CHOICES, type WorkType, type WorkPlatform } from "./work-type-fields";

export interface NewProjectFormValues {
  readonly name: string;
  readonly brief: string;
  readonly enterAfterCreate: boolean;
  readonly contentTypes: readonly WorkType[];
  /** 单份作品入口仍使用该值。 */
  readonly contentType?: WorkType;
  readonly targetPlatform?: WorkPlatform;
}

export interface NewProjectFormProps {
  readonly includeWorkType?: boolean;
  readonly multipleWorkTypes?: boolean;
  readonly submitLabel?: string;
  readonly advancedOpen?: boolean;
  readonly defaultValues?: Partial<NewProjectFormValues>;
  readonly onCreate: (values: NewProjectFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
  readonly className?: string;
}

const EMPTY_DEFAULTS: NewProjectFormValues = {name: "", brief: "", contentTypes: ["video"], enterAfterCreate: true};

/** 只收集真实创作输入，父层负责创建与路由。失败始终保留输入。 */
export function NewProjectForm({includeWorkType = false, multipleWorkTypes = true, submitLabel, advancedOpen = false,
  defaultValues, onCreate, onCancel, className}: NewProjectFormProps) {
  const initial = React.useMemo<NewProjectFormValues>(() => ({...EMPTY_DEFAULTS, ...defaultValues,
    contentTypes: defaultValues?.contentTypes ?? [defaultValues?.contentType ?? "video"]}), [defaultValues]);
  const [values, setValues] = React.useState(initial);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = React.useState(false);
  const canCreate = values.name.trim().length > 0 && values.contentTypes.length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setSubmitting(true);
    setErrorMsg(null);
    setNeedsAccount(false);
    try {
      await onCreate({...values, name: values.name.trim(),
        contentTypes: WORK_CHOICES.filter(choice => values.contentTypes.includes(choice.id)).map(choice => choice.id)});
      setValues({...EMPTY_DEFAULTS, contentTypes: values.contentTypes, contentType: values.contentType,
        targetPlatform: values.targetPlatform, enterAfterCreate: values.enterAfterCreate});
    } catch (error) {
      const accountError = isAccountRequiredError(error) || Boolean((error as {needsAccount?: boolean} | null)?.needsAccount);
      setNeedsAccount(accountError);
      setErrorMsg(accountError ? "请先添加或选择一个创作账号，再继续创建。" : describeUserError(error, "创建未完成，输入已保留。请重试。"));
    } finally {
      setSubmitting(false);
    }
  }

  return <form data-slot="new-project-form" data-form="new-project" noValidate onSubmit={handleSubmit} className={cn("flex flex-col gap-3.5", className)}>
    <fieldset disabled={submitting} className="contents">
      <ProjectNameField name={values.name} label={includeWorkType ? "作品主题" : "项目名称"}
        onChange={name => setValues(prev => ({...prev, name}))} />
      {includeWorkType && (multipleWorkTypes ? <WorkTypesFields values={values.contentTypes}
        onChange={contentTypes => setValues(prev => ({...prev, contentTypes}))} platform={values.targetPlatform ?? ""}
        onPlatformChange={targetPlatform => setValues(prev => ({...prev, targetPlatform: targetPlatform || undefined}))} disabled={submitting} />
        : <WorkTypeFields value={values.contentType ?? values.contentTypes[0] ?? "video"}
          onChange={contentType => setValues(prev => ({...prev, contentType, contentTypes: [contentType]}))}
          platform={values.targetPlatform ?? ""} onPlatformChange={targetPlatform => setValues(prev => ({...prev, targetPlatform: targetPlatform || undefined}))} disabled={submitting} />)}
      <details open={includeWorkType ? advancedOpen || undefined : true}>
        {includeWorkType && <summary className="cursor-pointer text-sm text-muted-foreground">详细设置（可选）</summary>}
        <div className="mt-2 flex flex-col gap-3.5">
          <ProjectBriefField brief={values.brief} onChange={brief => setValues(prev => ({...prev, brief}))} />
          <DialogHint />
        </div>
      </details>
    </fieldset>
    {errorMsg && <div role="alert" data-slot="new-project-error" className="rounded-control border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <p>{errorMsg}</p>
      {needsAccount && <Link href="/accounts" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium underline">添加或选择账号（新窗口打开，保留当前输入）</Link>}
    </div>}
    <FormFooter enterAfterCreate={values.enterAfterCreate} canCreate={canCreate} submitting={submitting}
      onEnterAfterCreateChange={enterAfterCreate => setValues(prev => ({...prev, enterAfterCreate}))}
      onCancel={() => {if (!submitting) {setValues(initial);setErrorMsg(null);setNeedsAccount(false);onCancel();}}} submitLabel={submitLabel} />
  </form>;
}
export default NewProjectForm;

interface ProjectNameFieldProps {
  readonly label?: string;
  readonly name: string;
  readonly onChange: (next: string) => void;
}

function ProjectNameField({ name, onChange, label = "项目名称" }: ProjectNameFieldProps) {
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
        {label}
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

function DialogHint() {
  return (
    <p
      data-slot="new-project-hint"
      className="text-[11px] text-muted-foreground"
    >
      创建后可在各工作台继续补充内容、调整尺寸和设置发布平台。
    </p>
  );
}

interface FormFooterProps {
  readonly submitLabel?: string;
  readonly enterAfterCreate: boolean;
  readonly canCreate: boolean;
  readonly submitting: boolean;
  readonly onEnterAfterCreateChange: (next: boolean) => void;
  readonly onCancel: () => void;
}

function FormFooter({
  submitLabel = "创建",
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
          aria-label="创建后进入工作区"
          checked={enterAfterCreate}
          disabled={submitting}
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
          {submitting ? "创建中…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
