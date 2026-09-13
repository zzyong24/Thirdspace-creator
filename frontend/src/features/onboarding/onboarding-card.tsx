"use client";

import * as React from "react";
import Link from "next/link";
import {ChevronDownIcon, ChevronRightIcon, CheckIcon, ArrowRightIcon, Rocket} from "lucide-react";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {deriveGuidedSteps, isOnboardingComplete, progressOf, type GuidedStep, type OnboardingState} from "./onboarding-steps";
import {loadState, saveOnboarding, type OnboardingPatch} from "./onboarding-data";
import {useAccountsChanged} from "@/lib/account-events";
import {readCurrentAccountId} from "@/lib/http-transport";

export const ONBOARDING_REOPEN_EVENT = "creatoros:onboarding-reopen";
// 重看是一次导航意图，不是持久完成记录；成功保存后才导航。
let reopenedAccount: string | null | undefined;
export async function requestOnboardingReopen(): Promise<void> {
  const accountId = readCurrentAccountId();
  if (accountId) await saveOnboarding(accountId, {hidden: false, collapsed: false});
  reopenedAccount = accountId;
  window.dispatchEvent(new Event(ONBOARDING_REOPEN_EVENT));
}

export function OnboardingCard() {
  const [state, setState] = React.useState<OnboardingState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [sessionHidden, setSessionHidden] = React.useState(false);
  const [forceOpen, setForceOpen] = React.useState(false);
  const generation = React.useRef(0);
  const saveLock = React.useRef(false);
  const refresh = React.useCallback(() => {
    const ticket = ++generation.current;
    const accountId = readCurrentAccountId();
    saveLock.current = false; setSaving(false);
    setState(null); setSessionHidden(false); setError(null);
    setForceOpen(reopenedAccount === accountId);
    void loadState().then(next => {
      if (ticket !== generation.current || readCurrentAccountId() !== accountId) return;
      setState(next); setError(next.persistenceError ?? null);
      if (reopenedAccount === accountId) reopenedAccount = undefined;
    }).catch(() => {
      if (ticket === generation.current && readCurrentAccountId() === accountId) setError("引导进度暂时无法读取，其他功能可以正常使用。");
    });
  }, []);
  React.useEffect(() => {refresh(); return () => {generation.current += 1;};}, [refresh]);
  React.useEffect(() => {
    window.addEventListener(ONBOARDING_REOPEN_EVENT, refresh);
    return () => window.removeEventListener(ONBOARDING_REOPEN_EVENT, refresh);
  }, [refresh]);
  useAccountsChanged(refresh);

  const update = async (patch: OnboardingPatch) => {
    if (!state || saveLock.current) return;
    const accountId = state.accountId ?? null;
    if (accountId !== readCurrentAccountId()) return;
    if (!accountId) {
      if (patch.hidden) setSessionHidden(true);
      else setState({...state, origin: patch.origin ?? state.origin});
      return;
    }
    const ticket = generation.current;
    saveLock.current = true; setSaving(true); setError(null);
    try {
      const preferences = await saveOnboarding(accountId, patch);
      if (ticket !== generation.current || accountId !== readCurrentAccountId()) return;
      setState({...state, origin: preferences.origin, completedSteps: preferences.completedSteps, preferences});
      if (patch.hidden) {reopenedAccount = undefined; setForceOpen(false);}
    } catch {
      if (ticket === generation.current && accountId === readCurrentAccountId()) setError("进度未保存，请再试一次。当前操作尚未完成。");
    } finally {if (ticket === generation.current) {saveLock.current = false; setSaving(false);}}
  };

  if (sessionHidden || state?.preferences?.hidden) return null;
  if (!state) return error ? <section className="mt-14 flex items-center gap-3 rounded-card border p-3 text-sm" aria-label="新手引导"><p role="status">{error}</p><Button variant="outline" size="sm" onClick={refresh}>重试</Button><Button variant="ghost" size="sm" onClick={()=>setSessionHidden(true)}>暂时关闭</Button></section> : null;
  const steps = deriveGuidedSteps(state);
  if (isOnboardingComplete(steps) && !forceOpen) return null;
  const {done,total} = progressOf(steps);
  const current = steps.find(step => !step.done);
  const collapsed = state.preferences?.collapsed ?? true;
  const displayed = collapsed ? (current ? [current] : []) : steps;
  return <section data-slot="onboarding-card" aria-label="新手引导" className="mt-14 flex flex-col gap-3 rounded-card border border-brand/25 bg-brand-soft/20 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" data-slot="onboarding-card-toggle" aria-expanded={!collapsed} disabled={saving || !state.accountId} onClick={()=>void update({collapsed:!collapsed})} className="flex items-center gap-2 text-left text-sm">
        {collapsed ? <ChevronRightIcon className="size-4"/> : <ChevronDownIcon className="size-4"/>}<Rocket className="size-4 text-brand"/><span className="font-semibold">上手引导</span><span className="text-xs text-muted-foreground" data-slot="onboarding-card-progress-count">已完成 {done} / {total}</span>
      </button>
      <Button variant="ghost" size="sm" data-slot="onboarding-card-dismiss" disabled={saving} onClick={()=>void update({hidden:true})}>结束引导</Button>
    </div>
    {error ? <div role="status" className="flex items-center gap-2 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={refresh}>重新读取</Button></div> : null}
    <div role="progressbar" aria-label="上手进度" aria-valuenow={Math.round(done/total*100)} aria-valuemin={0} aria-valuemax={100} className="h-1 overflow-hidden rounded-full bg-border"><div className="h-full bg-brand" style={{width:`${done/total*100}%`}}/></div>
    {isOnboardingComplete(steps) ? <p className="text-sm text-muted-foreground" data-slot="onboarding-reopened-complete">已完成全部引导，可以随时回看。</p> : null}
    <ol data-slot="onboarding-card-body" className="flex flex-col gap-2">{displayed.map(step=><StepRow key={step.key} step={step} current={step.key===current?.key} busy={saving} canConfirm={state.hasImportedWorks===true} onUpdate={patch=>void update(patch)}/>)}</ol>
    <p className="text-xs text-muted-foreground">引导仅提供建议。你可以直接使用所有功能，或在设置中重新查看。</p>
  </section>;
}
function StepRow({step,current,busy,canConfirm,onUpdate}:{step:GuidedStep;current:boolean;busy:boolean;canConfirm:boolean;onUpdate:(patch:OnboardingPatch)=>void}) {
 return <li data-slot="onboarding-step" data-step-key={step.key} data-done={step.done} data-current={current} className={cn("flex flex-wrap items-center gap-3 rounded-control p-3",current ? "bg-brand-soft/50" : "bg-surface-subtle")}>
  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs text-brand">{step.done?<CheckIcon className="size-4"/>:step.order}</span>
  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{step.title}</p><p className="mt-1 text-xs text-muted-foreground">{step.done?"已完成":step.why}</p></div>
  {!step.done && step.key==="confirm-origin" ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>onUpdate({origin:"fresh",completedSteps:["confirm-origin"]})}>新账号</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>onUpdate({origin:"existing",completedSteps:["confirm-origin"]})}>已有作品</Button></div> : null}
  {!step.done && step.key!=="confirm-origin" ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" asChild><Link href={step.href}>{step.ctaLabel}<ArrowRightIcon className="size-3"/></Link></Button>{step.key==="review-imported-projects" ? <Button size="sm" disabled={busy || !canConfirm} onClick={()=>onUpdate({completedSteps:["review-imported-projects"]})}>已查看，完成这一步</Button> : null}</div> : null}
 </li>;
}
