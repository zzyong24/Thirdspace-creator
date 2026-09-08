"use client";
import * as React from "react";
import { useSettingsMutation } from "./use-settings-mutation";

/** 保存失败留在原表单；beforeTest 收到 false 后不会发起探针。 */
export function useModelConfigurationMutation() {
  const mutation = useSettingsMutation();
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useCallback(async (save: () => Promise<unknown>) => {
    setError(null);
    try { return await mutation.run(save); }
    catch(cause) {
      setError(cause instanceof Error ? cause.message : "保存模型配置失败，请重试");
      return false;
    }
  }, [mutation.run]);
  return { pending: mutation.pending, run, error };
}
