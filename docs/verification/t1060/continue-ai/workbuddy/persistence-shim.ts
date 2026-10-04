// 验证专用装配；唯一替换宿主实例，业务与门卫均用原源码。
const host = () => (globalThis as any).__t1060McpHost;
export const compositeTransport = { request: (...args: any[]) => host().transport.request(...args) };
export const getIdentityService = async () => host().identity;
export const getPlatformAccountService = async () => host().accounts;
export const getCliInvocationService = async () => host().cliInvocations;
export const getReportingLocal = async () => { throw Error('UNUSED_DIAGNOSTIC_PORT_NOT_INSTALLED'); };
