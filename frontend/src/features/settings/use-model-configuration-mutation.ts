"use client";
import * as React from "react";
import { useSettingsMutation } from "./use-settings-mutation";

/** Private UI-owner disposition, never a provider/request error classification. */
class ObsoleteModelSave extends Error {}

/** 保存失败留在原表单；beforeTest 收到 false 后不会发起探针。 */
export function useModelConfigurationMutation() {
  const mutation = useSettingsMutation();
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useCallback(async (save: () => Promise<unknown>, isCurrent?: () => boolean) => {
    if(isCurrent && !isCurrent()) return false;
    setError(null);
    try {
      return await mutation.run(async () => {
        if(isCurrent && !isCurrent()) throw new ObsoleteModelSave();
        let response: unknown;
        try { response = await save(); }
        catch(cause) {
          if(isCurrent && !isCurrent()) throw new ObsoleteModelSave();
          throw cause;
        }
        // This must reject before shared run reaches router.refresh. Returning
        // false/undefined here would still refresh a different group-only view.
        if(isCurrent && !isCurrent()) throw new ObsoleteModelSave();
        return response;
      });
    }
    catch(cause) {
      if(cause instanceof ObsoleteModelSave) return false;
      setError(cause instanceof Error ? cause.message : "保存模型配置失败，请重试");
      return false;
    }
  }, [mutation.run]);
  return { pending: mutation.pending, run, error };
}
