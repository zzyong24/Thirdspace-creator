// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ENDPOINTS, type Endpoint, type RequestContext } from '@creatoros/contract';
import {
  aiTasks,
  aiTaskResults,
  executionCalls,
  executionTasks,
  scriptReviewReports,
  projects,
  workCompositions,
  eq,
  type Db,
} from '@creatoros/backend';
import {
  workReviewReports,
  workReviewRequests,
  workReviewConfirmations,
} from '../../../../backend/src/schema/work-reviews';
import { accountGroupMemberships } from '../../../../backend/src/schema/account-groups';
import { canonicalDataset } from '@/fixtures/canonical';
const owned = vi.hoisted(() => ({
  media: '',
  db: null as Db | null,
  dispatcher: null as any,
  kind: 'script' as 'script' | 'work',
  errors: [] as any[],
  invocations: [] as any[],
  prepares: [] as any[],
  submits: [] as any[],
  wakes: [] as any[],
  sql: [] as any[],
  rootService: null as any,
}));
// 外部边界：owned媒体与渠道权威；真实Settings/prepare/host/业务/ledger不替换。
vi.mock('@creatoros/backend/modules/assets', async (original) => {
  const actual = await original<typeof import('@creatoros/backend/modules/assets')>();
  return {
    ...actual,
    migrateStorageRoot: async () => {
      throw Error('测试禁止迁移用户媒体');
    },
    createLocalFsObjectStorage: (...args: Parameters<typeof actual.createLocalFsObjectStorage>) =>
      actual.createLocalFsObjectStorage({ ...args[0], rootPath: owned.media }, args[1]),
  };
});
vi.mock('@/server/activation/client-config.server', async (original) => ({
  ...(await original<typeof import('@/server/activation/client-config.server')>()),
  readChannelModelAuthority: vi.fn(async () => ({ authority: 'local' })),
}));
vi.mock('@creatoros/backend/modules/ai-runtime', async (original) => {
  const actual = await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
  return {
    ...actual,
    composeChatProduction: (...args: Parameters<typeof actual.composeChatProduction>) => ({
      ...actual.composeChatProduction(...args),
      start: () => {},
    }),
    createStructuredBusinessExecutionService: (
      ...args: Parameters<typeof actual.createStructuredBusinessExecutionService>
    ) => {
      const service = actual.createStructuredBusinessExecutionService(...args);
      return {
        ...service,
        async prepare(...args: Parameters<typeof service.prepare>) {
          try {
            const result = await service.prepare(...args);
            owned.prepares.push({ taskId: args[1], ctx: args[0], result });
            return result;
          } catch (error) {
            owned.prepares.push({
              taskId: args[1],
              ctx: args[0],
              error: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : null,
              },
            });
            throw error;
          }
        },
      };
    },
  };
});
// 实际root端口透明观察：原tx、ctx、业务输入/返回及错误均原样执行。
vi.mock('@creatoros/backend/application/generation/work-review-root', async (original) => {
  const actual =
    await original<typeof import('@creatoros/backend/application/generation/work-review-root')>();
  return {
    ...actual,
    createWorkReviewRoot: (...args: Parameters<typeof actual.createWorkReviewRoot>) => {
      const ports = args[2];
      const root = actual.createWorkReviewRoot(args[0], args[1], {
        ...ports,
        ai: (tx) => {
          const ai = ports.ai(tx);
          return {
            ...ai,
            async createTask(...input: Parameters<typeof ai.createTask>) {
              owned.submits.push({ ctx: input[0], input: input[1] });
              return ai.createTask(...input);
            },
          };
        },
        async wake(...input: Parameters<typeof ports.wake>) {
          owned.wakes.push({ ctx: input[0], taskId: input[1] });
          return ports.wake(...input);
        },
      });
      owned.rootService = root.service;
      return root;
    },
  };
});
// 只透明观察真实invoke；参数/返回值/异常原样转发，不更换validate或完成服务。
vi.mock('../../../../backend/src/modules/execution/worker-supervisor', async (original) => {
  const actual =
    await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();
  return {
    ...actual,
    createWorkerSupervisor: (options: Parameters<typeof actual.createWorkerSupervisor>[0]) =>
      actual.createWorkerSupervisor({
        ...options,
        ports: {
          ...options.ports,
          async invoke(ref, port, input) {
            owned.invocations.push({ ref, port, input });
            try {
              return await options.ports.invoke(ref, port, input);
            } catch (error) {
              owned.errors.push({
                ref,
                port,
                input,
                name: error instanceof Error ? error.name : 'Error',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : null,
              });
              throw error;
            }
          },
        },
      }),
  };
});
vi.mock('@creatoros/backend/modules/execution', async (original) => {
  const actual = await original<typeof import('@creatoros/backend/modules/execution')>();
  return {
    ...actual,
    createModelWorkerDispatcher: (
      ...args: Parameters<typeof actual.createModelWorkerDispatcher>
    ) => {
      owned.db = args[0];
      const dispatcher = actual.createModelWorkerDispatcher(args[0], {
        ...args[1],
        entryPath:
          '/private/tmp/t1300-artifact-bcz9nlt5/sidecar/frontend/runtime/execution-worker.cjs',
      });
      owned.dispatcher = dispatcher;
      return { ...dispatcher, start: () => {} };
    },
  };
});
import { compositeTransport, __resetPersistenceForTests } from '@/server/persistence-client';
const user: RequestContext = {
  userId: canonicalDataset.user.id,
  requestId: 't1313-owned-public-review',
  source: 'user',
};
let root = '',
  server: Server | undefined,
  requests: any[] = [],
  caseName = '',
  seq = 0,
  restoreSql: undefined | (() => void);
async function call(
  endpoint: Endpoint,
  ctx: RequestContext,
  body?: unknown,
  params?: unknown,
  query?: unknown,
): Promise<any> {
  return (
    (await compositeTransport.request(endpoint, { params, body, query } as never, ctx)) as {
      data: unknown;
    }
  ).data;
}
async function evidence(name: string, value: unknown) {
  const directory = resolve(
    '../docs/verification/t1313/runtime',
    process.env.T1313_RUN_ID ?? 'unlabelled',
  );
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name + '.json'), JSON.stringify(value, null, 2) + '\n');
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 't1313-owned-review-'));
  owned.media = join(root, 'media');
  owned.errors = [];
  owned.invocations = [];
  owned.prepares = [];
  owned.submits = [];
  owned.wakes = [];
  owned.sql = [];
  requests = [];
  vi.stubEnv('CREATOROS_DISABLE_BACKGROUND_DRIVERS', '1');
  vi.stubEnv('CREATOROS_DISABLE_SCHEDULER', '1');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('PGLITE_DATA_DIR', join(root, 'db'));
  vi.stubEnv('CREATOROS_STORAGE', 'local');
  vi.stubEnv('CREATOROS_CLIENT_CONFIG_PULL_ENABLED', '0');
  vi.stubEnv('CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH', '/nonexistent/t1313-fixture');
  __resetPersistenceForTests();
  const binding = JSON.parse(
      await readFile(resolve('../docs/verification/t1313/WORKER_BINDING.json'), 'utf8'),
    ),
    bytes = await readFile(binding.executionWorkerPath);
  expect(bytes.length).toBe(binding.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(binding.sha256);
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ url: req.url, body });
    const object =
      owned.kind === 'script'
        ? { verdict: 'risk', summary: '受控模型按实际原稿给出完整审核报告', findings: [] }
        : { conclusion: 'no_issue_found', issues: [], visualVerification: 'not_applicable' };
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(
        `data: ${JSON.stringify({ id: 't1313', object: 'chat.completion.chunk', created: 1, model: 't1313-controlled', choices: [{ index: 0, delta: { role: 'assistant', content: JSON.stringify(object) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 't1313', object: 'chat.completion.chunk', created: 1, model: 't1313-controlled', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\ndata: [DONE]\n\n`,
      );
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 't1313',
          object: 'chat.completion',
          created: 1,
          model: 't1313-controlled',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: JSON.stringify(object) },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
      );
    }
  });
  await new Promise<void>((done, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', done);
  });
}, 180000);
afterEach(async () => {
  try {
    if (owned.db)
      await evidence(caseName + '-final', {
        root,
        requests,
        invocations: owned.invocations,
        errors: owned.errors,
        prepares: owned.prepares,
        submits: owned.submits,
        wakes: owned.wakes,
        sql: owned.sql,
        projects: await owned.db.select().from(projects),
        compositions: await owned.db.select().from(workCompositions),
        reviewRequests: await owned.db.select().from(workReviewRequests),
        confirmations: await owned.db.select().from(workReviewConfirmations),
        business: await owned.db.select().from(aiTasks),
        executions: await owned.db.select().from(executionTasks),
        calls: await owned.db.select().from(executionCalls),
        scriptReports: await owned.db.select().from(scriptReviewReports),
        workReports: await owned.db.select().from(workReviewReports),
        results: await owned.db.select().from(aiTaskResults),
      });
  } finally {
    restoreSql?.();
    restoreSql = undefined;
    await owned.dispatcher?.stop();
    await (
      globalThis as { __creatorosDisposePersistence?: () => Promise<void> }
    ).__creatorosDisposePersistence?.();
    __resetPersistenceForTests();
    server?.closeAllConnections();
    if (server?.listening) await new Promise<void>((done) => server!.close(() => done()));
    server = undefined;
    owned.db = null;
    owned.dispatcher = null;
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
}, 180000);
async function configure(ctx: RequestContext) {
  const baseUrl = `http://127.0.0.1:${(server!.address() as { port: number }).port}/v1`;
  await call(
    ENDPOINTS.putModel,
    ctx,
    {
      provider: 'openai',
      modelName: 't1313-controlled',
      apiFormat: 'openai_chat',
      baseUrl,
      secret: 'owned-controlled-fixture',
      settings: { structuredOutputs: true },
    },
    { capability: 'default' },
  );
  const routing = await call(ENDPOINTS.getModelRouting, ctx);
  await call(ENDPOINTS.putModelRouting, ctx, {
    schemaVersion: 1,
    choices: {
      text: 'self',
      vision: 'official',
      image: 'official',
      video: 'official',
      audio: 'local',
      embed: 'official',
    },
    expectedRevision: routing.revision,
  });
}
const publicCases = (['group', 'legacy', 'group-account'] as const).flatMap((scope) =>
  (['script', 'work'] as const).map((kind) => ({ scope, kind })),
);
it.each(publicCases)(
  '完整公开审核 $scope/$kind：实际immutable worker原host完成报告',
  async ({ scope, kind }) => {
    caseName = scope + '-' + kind;
    owned.kind = kind;
    let group: any, ctx: RequestContext;
    if (scope === 'legacy') {
      const account = await call(ENDPOINTS.createAccount, user, {
        platform: 'bilibili',
        accountHandle: 'T1313真实legacy' + kind,
      });
      const member = (
        await owned
          .db!.select()
          .from(accountGroupMemberships)
          .where(eq(accountGroupMemberships.accountId, account.id))
      ).find((row) => row.leftAt === null)!;
      group = await call(ENDPOINTS.getAccountGroup, user, undefined, { groupId: member.groupId });
      ctx = { ...user, accountId: account.id };
    } else {
      group = await call(ENDPOINTS.createAccountGroup, user, {
        name: 'T1313真实组' + kind,
        idempotencyKey: 't1313-' + kind + '-' + ++seq,
      });
      ctx = { ...user, groupId: group.id, accountId: null };
      if (scope === 'group-account') {
        const account = await call(ENDPOINTS.createAccount, ctx, {
          platform: 'bilibili',
          accountHandle: 'T1313组内真实账号',
        });
        ctx = { ...ctx, accountId: account.id };
      }
    }
    await configure(ctx);
    const session = (owned.db as any).session,
      old = session.logger,
      previous = session.options.logger,
      logger = {
        logQuery(query: string, params: unknown[]) {
          owned.sql.push({ query, params });
          old.logQuery(query, params);
        },
      };
    session.logger = logger;
    session.options.logger = logger;
    restoreSql = () => {
      session.logger = old;
      session.options.logger = previous;
    };
    const project = await call(ENDPOINTS.createProject, ctx, { title: 'T1313公开原稿' + kind });
    let businessId: string, reportId: string | undefined;
    const script = '这是T1313隔离公共原稿，先展示真实操作，再说明适用条件，不因审核结果改写。';
    if (kind === 'script') {
      const artifact = await call(
        ENDPOINTS.createArtifact,
        ctx,
        { title: '真实待审脚本', artifactType: 'master_script', stage: 'script' },
        { projectId: project.id },
      );
      await call(
        ENDPOINTS.createArtifactVersion,
        ctx,
        { contentText: script },
        { artifactId: artifact.id },
      );
      const task = await call(ENDPOINTS.triggerScriptReview, ctx, undefined, {
        projectId: project.id,
      });
      businessId = task.id;
    } else {
      let composition = (
        await call(ENDPOINTS.createWorkComposition, ctx, {
          projectId: project.id,
          title: '公开作品组合',
          clientRequestId: 't1313-composition',
        })
      ).composition;
      composition = (
        await call(
          ENDPOINTS.createWorkCompositionMember,
          ctx,
          {
            expectedRevision: composition.currentRevision,
            clientRequestId: 't1313-member',
            memberInput: {
              kind: 'moments',
              document: { schemaVersion: 1, text: script, imageUses: [], sourceRefs: [] },
            },
          },
          { compositionId: composition.compositionId },
        )
      ).composition;
      const member = composition.current.members[0].member;
      if (member.kind !== 'moments') throw Error('公开真实朋友圈成员缺失');
      const reviewScope = {
        kind: 'field',
        compositionId: composition.compositionId,
        member,
        target: { kind: 'moments_field', momentsId: member.momentsId, field: 'text' },
      };
      await evidence(caseName + '-parents-before', {
        ctx,
        group,
        project: (await owned.db!.select().from(projects).where(eq(projects.id, project.id)))[0],
        composition: (
          await owned
            .db!.select()
            .from(workCompositions)
            .where(eq(workCompositions.id, composition.compositionId))
        )[0],
        reviewScope,
      });
      let createError: unknown, report: any;
      try {
        report = await call(ENDPOINTS.createWorkReview, ctx, {
          clientRequestId: 't1313-work-review',
          scope: reviewScope,
        });
      } catch (error) {
        createError = {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null,
        };
      }
      const reports = await owned.db!.select().from(workReviewReports),
        actualReport = reports.find((row) => row.compositionId === composition.compositionId),
        business = actualReport
          ? (await owned.db!.select().from(aiTasks)).find((row) => row.id === actualReport.taskId)
          : undefined;
      if (business)
        await vi.waitFor(
          () => expect(owned.prepares.some((row) => row.taskId === business.id)).toBe(true),
          { timeout: 120000, interval: 50 },
        );
      await evidence(caseName + '-prepared', {
        ctx,
        group,
        createError,
        report,
        project: (await owned.db!.select().from(projects).where(eq(projects.id, project.id)))[0],
        composition: (
          await owned
            .db!.select()
            .from(workCompositions)
            .where(eq(workCompositions.id, composition.compositionId))
        )[0],
        reportRow: actualReport,
        requests: await owned.db!.select().from(workReviewRequests),
        business,
        prepares: owned.prepares,
        submits: owned.submits,
        wakes: owned.wakes,
        executions: await owned.db!.select().from(executionTasks),
        calls: await owned.db!.select().from(executionCalls),
        providerRequests: requests,
        sql: owned.sql,
      });
      expect(createError, JSON.stringify(createError)).toBeUndefined();
      const preparation = owned.prepares.find((row) => row.taskId === business?.id);
      expect(preparation?.error, JSON.stringify(preparation?.error)).toBeUndefined();
      expect(actualReport).toBeTruthy();
      expect(business).toBeTruthy();
      businessId = business!.id;
      reportId = actualReport!.id;
    }
    await vi.waitFor(
      async () =>
        expect(
          (await call(ENDPOINTS.getTask, ctx, undefined, { taskId: businessId })).executionTaskId,
        ).toBeTruthy(),
      { timeout: 120000, interval: 50 },
    );
    const before = (await owned.db!.select().from(aiTasks).where(eq(aiTasks.id, businessId)))[0]!;
    expect(before.groupId).toBe(group.id);
    if (scope === 'group') expect(before.accountId).toBeNull();
    if (scope === 'legacy') expect(before.accountId).toBe(ctx.accountId);
    await evidence(caseName + '-before-dispatch', {
      group,
      ctx,
      project,
      business: before,
      execution: (
        await owned
          .db!.select()
          .from(executionTasks)
          .where(eq(executionTasks.id, before.executionTaskId!))
      )[0],
    });
    await owned.dispatcher.drainOnce();
    const task = await call(ENDPOINTS.getTask, ctx, undefined, { taskId: businessId }),
      calls = await owned
        .db!.select()
        .from(executionCalls)
        .where(eq(executionCalls.executionTaskId, before.executionTaskId!));
    const firstError = owned.errors.find((row) => row.port === 'commitResult');
    await evidence(caseName + '-outcome', { task, calls, firstError, requests });
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0].body)).toContain(script);
    expect(calls.filter((row) => row.kind === 'model' && row.status === 'settled')).toHaveLength(1);
    expect(calls.find((row) => row.kind === 'model')!.providerResult).toBeTruthy();
    expect(firstError, JSON.stringify(firstError)).toBeUndefined();
    expect(task.status, JSON.stringify(task)).toBe('succeeded');
    expect(task.runtimeStatus).toBe('succeeded');
    expect(await call(ENDPOINTS.listTaskResults, ctx, undefined, { taskId: businessId })).toEqual(
      [],
    );
    if (kind === 'script') {
      const report = await call(ENDPOINTS.getLatestScriptReview, ctx, undefined, {
        projectId: project.id,
      });
      expect(report).toMatchObject({
        projectId: project.id,
        verdict: 'risk',
        summary: '受控模型按实际原稿给出完整审核报告',
        modelLabel: 't1313-controlled',
      });
      expect(calls[0]!.resultRef).toBe(report.id);
    } else {
      const report = await call(ENDPOINTS.getWorkReview, ctx, undefined, { reportId });
      expect(report).toMatchObject({
        status: 'succeeded',
        taskId: businessId,
        settledCallId: calls[0]!.id,
        outcome: { conclusion: 'no_issue_found', visualVerification: 'not_applicable' },
      });
      expect(calls[0]!.resultRef).toBe(reportId);
      const confirmed = await call(ENDPOINTS.confirmWorkReview, ctx, {
        mode: 'model',
        clientRequestId: 't1313-confirm-original-report',
        scope: report.snapshot.scope,
        expectedFingerprint: report.snapshot.fingerprint,
        reportId: report.reportId,
        historicalBasis: [],
      });
      expect(confirmed.status).toMatchObject({
        state: 'confirmed_current',
        modelVerification: 'verified',
        confirmedReport: { reportId: report.reportId },
      });
      expect(
        await call(ENDPOINTS.getWorkReviewStatus, ctx, { scope: report.snapshot.scope }),
      ).toMatchObject({ state: 'confirmed_current', confirmation: { reportId: report.reportId } });
      await evidence(caseName + '-confirmed', {
        report,
        confirmed,
        submits: owned.submits,
        wakes: owned.wakes,
        sql: owned.sql,
      });
    }
  },
  3600000,
);
