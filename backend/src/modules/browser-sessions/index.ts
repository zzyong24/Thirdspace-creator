// [T-370a] Browser Sessions module(web 域登录态加密单一真值)—— ONLY public entry
// (foundation §1)。persistence-client 只经本文件 import(host 内部 service,无契约 op)。

export {
  createBrowserSessionsService,
  BrowserSessionCryptoError,
  WEB_DOMAIN_SCOPE,
  type BrowserSessionsService,
  type ServiceDeps,
} from "./browser-sessions.service";

export {
  createBrowserSessionsRepository,
  type BrowserSessionsRepository,
  type BrowserSessionRow,
  type RepoDeps,
} from "./browser-sessions.repository";

export { browserSessions, BROWSER_SESSIONS_DDL } from "./browser-sessions.db-schema";
