'use strict';
// Test host only: the same Node AsyncLocalStorage implementation used by Next.
// No cookie/session/page/owner response is replaced.
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
