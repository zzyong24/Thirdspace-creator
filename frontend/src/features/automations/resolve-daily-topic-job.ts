import { ENDPOINTS, scheduledJobResource, type Client } from '@creatoros/contract';

type JobClient = Pick<Client<typeof ENDPOINTS>, 'listScheduledJobs' | 'createScheduledJob'>;
type CreateInput = Parameters<JobClient['createScheduledJob']>[0];

/** 同组每日选题先读取真实作业；复用时不写开关、名称或频率。 */
export async function resolveDailyTopicJob(client: JobClient, input: CreateInput) {
  if (input.body.sourceKind !== 'topic.daily') throw new Error('仅支持复用组内每日选题任务');
  const jobs = scheduledJobResource.array().parse(await client.listScheduledJobs({
    params: undefined,
    body: undefined,
    query: { sourceKind: 'topic.daily', page: 1, pageSize: 100 },
  }));
  const existing = jobs.find(job => job.sourceKind === 'topic.daily');
  if (existing) return { job: existing, reused: true };
  // 查询后出现并发变化时，保留正式create的权限、校验和停用保护错误。
  return { job: await client.createScheduledJob(input), reused: false };
}
