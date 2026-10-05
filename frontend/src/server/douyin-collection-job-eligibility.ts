/** 抖音默认采集任务只服务于已启用的抖音账号，其他平台使用各自的采集入口。 */
export function shouldEnsureDouyinCollectionJobs(account: {
  readonly platform: string;
  readonly status: string;
}): boolean {
  return account.platform === "douyin" && account.status === "active";
}
