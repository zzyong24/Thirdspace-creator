#!/usr/bin/env node
// bin 入口 —— monorepo 各包统一以 src/*.ts 直发(不 build),这里用 tsx 的 ESM loader
// 在进程内注册 TS 支持后直接 import TS 入口,使 `creatoros-mcp` 可被 node 直接执行。
import { register } from "tsx/esm/api";

register();
await import("../src/index.ts");
