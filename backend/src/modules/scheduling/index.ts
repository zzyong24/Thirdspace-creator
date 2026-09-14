// Scheduling module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composition root (persistence-client) imports Scheduling ONLY through this file (never
// its internals): the service + repository + transport factories, the op-id list the
// composite merges, SCHEDULING_DDL, the contract DTOs + mappers, and the error classes the
// dispatch route maps. No cross-module repository import.

export {
  createSchedulingService,
  type SchedulingService,
  type ServiceDeps,
  type CreateJobInput,
  type UpdateJobInput,
  type ListJobsQuery,
  type ListRunsQuery,
  type UpdateRunInput,
} from "./scheduling.service";

export {
  createSchedulingRepository,
  type SchedulingRepository,
  type RepoDeps,
  type ScheduledJobRow,
  type JobRunRow,
} from "./scheduling.repository";

export {
  createSchedulingTransport,
  SCHEDULING_OP_IDS,
} from "./scheduling.transport";

export { SCHEDULING_DDL } from "./scheduling.db-schema";

export {
  OwnershipError,
  UnsupportedOperationError,
  AuthenticationError,
  ValidationError,
} from "./scheduling.errors";

export {
  scheduledJobResource,
  jobRunResource,
  toScheduledJobDto,
  toJobRunDto,
  type ScheduledJobResource,
  type JobRunResource,
} from "./scheduling.schema";

export {createDailyTopicRunService,type DailyTopicRunRef} from "./daily-topic-run.service";

export {createDailyTopicRunIntentService} from "./daily-topic-run-intent.service";
export {createCollectionRunStateService} from "./collection-run-state.service";
