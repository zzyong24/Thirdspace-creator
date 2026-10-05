import * as React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTopicPreview } from "./use-topic-preview";
import type { RadarApi, RadarItemDetail } from "./intelligence-workbench-types";
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });
let seq = 0;
function fixture() {
  const id = `t1017-hook-${++seq}`;
  const detail = { item: { id }, snapshots: [{ id: `${id}-snapshot` }], transforms: [{ id: `${id}-old`, sourceSnapshotId: `${id}-snapshot`, idempotencyKey: "old-request", status: "candidate", taskStatus: "failed", outputSnapshot: null, targetTopicId: null }] } as RadarItemDetail;
  const completed = { ...detail, transforms: [{ id: `${id}-new`, sourceSnapshotId: `${id}-snapshot`, idempotencyKey: "assigned-later", status: "candidate" as const, taskStatus: "succeeded" as const, outputSnapshot: { generationMode: "rewrite_only" as const, adaptedDraft: { generationMode: "rewrite_only" as const, contentText: "纯文本正文", sourceSnapshotId: `${id}-snapshot`, generatedFromTranscriptHash: "hash", personalizationStatus: "not_applied" as const, templateVersion: "v3" } }, targetTopicId: null }] };
  const api = { previewTopic: vi.fn(), getItem: vi.fn() } as unknown as RadarApi;
  const storageKey = `creatoros:radar-topic-preview:v1:${id}:${id}-snapshot`;
  const mount = (initial = detail) => renderHook(() => {
    const [current, setDetail] = React.useState<RadarItemDetail | null>(initial);
    const [notice, setNotice] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const activeDetailItemId = React.useRef<string | null>(initial.item.id);
    const hook = useTopicPreview({ api, detail: current, positioningVersionId: null, setDetail, setNotice, setBusy, activeDetailItemId });
    return { ...hook, current, setDetail, notice, busy, activeDetailItemId };
  });
  return { detail, completed, api, storageKey, mount };
}
it("[T-1017] 旧任务变化不能清理未知请求键，重开页面仍复用原请求且无定位ID", async () => {
  const f = fixture();
  const changedOld = { ...f.detail, transforms: f.detail.transforms.map(t => ({ ...t, taskStatus: "succeeded" as const })) };
  vi.mocked(f.api.getItem).mockResolvedValue(changedOld);
  vi.mocked(f.api.previewTopic).mockImplementationOnce(async input => {
    expect(JSON.parse(localStorage.getItem(f.storageKey)!).idempotencyKey).toBe(input.idempotencyKey);
    expect(input).not.toHaveProperty("positioningVersionId");
    throw new Error("response lost");
  });
  const first = f.mount();
  await act(async () => { await first.result.current.previewTopic(); });
  const key = vi.mocked(f.api.previewTopic).mock.calls[0]![0].idempotencyKey;
  expect(first.result.current.previewNeedsReconciliation).toBe(true);
  expect(JSON.parse(localStorage.getItem(f.storageKey)!).idempotencyKey).toBe(key);
  first.unmount();
  const second = f.mount(changedOld);
  f.completed.transforms[0]!.idempotencyKey = key;
  vi.mocked(f.api.previewTopic).mockImplementationOnce(async input => {
    expect(input.idempotencyKey).toBe(key);
    vi.mocked(f.api.getItem).mockResolvedValue(f.completed);
    return { transform: f.completed.transforms[0]!, task: { id: "new-task", status: "succeeded" } } as Awaited<ReturnType<RadarApi["previewTopic"]>>;
  });
  await act(async () => { await second.result.current.previewTopic(); });
  await waitFor(() => expect(second.result.current.notice).toContain("改写稿已生成"));
  expect(f.api.previewTopic).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem(f.storageKey)).toBeNull();
  expect(second.result.current.current?.transforms[0]?.outputSnapshot?.adaptedDraft?.contentText).toBe("纯文本正文");
});
it("[T-1017] 确认原请求已受理时只读取该任务，既有稿件不创建新调用", async () => {
  const f = fixture(), key = "persisted-key";
  localStorage.setItem(f.storageKey, JSON.stringify({ itemId: f.detail.item.id, sourceSnapshotId: f.detail.snapshots[0]!.id, idempotencyKey: key, baselineTransforms: {} }));
  f.completed.transforms[0]!.idempotencyKey = key;
  vi.mocked(f.api.getItem).mockResolvedValue(f.completed);
  const mounted = f.mount();
  await act(async () => { await mounted.result.current.previewTopic(); });
  expect(f.api.previewTopic).not.toHaveBeenCalled();
  expect(localStorage.getItem(f.storageKey)).toBeNull();
  await waitFor(() => expect(mounted.result.current.current?.transforms[0]?.id).toBe(f.completed.transforms[0]!.id));
});
it("[T-1017] 作品切换后迟到的生成响应不得覆盖当前作品，原请求键仍可恢复", async () => {
  const f = fixture(); let finish!: (value: Awaited<ReturnType<RadarApi["previewTopic"]>>) => void;
  vi.mocked(f.api.previewTopic).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const mounted = f.mount(); let pending!: Promise<void>;
  act(() => { pending = mounted.result.current.previewTopic(); });
  const other = { ...f.detail, item: { ...f.detail.item, id: "other-item" }, transforms: [] };
  act(() => { mounted.result.current.activeDetailItemId.current = "other-item"; mounted.result.current.setDetail(other); });
  await act(async () => { finish({ transform: f.completed.transforms[0]!, task: { id: "task", status: "succeeded" } } as Awaited<ReturnType<RadarApi["previewTopic"]>>); await pending; });
  expect(mounted.result.current.current?.item.id).toBe("other-item");
  expect(mounted.result.current.current?.transforms).toEqual([]);
  expect(localStorage.getItem(f.storageKey)).not.toBeNull();
});
