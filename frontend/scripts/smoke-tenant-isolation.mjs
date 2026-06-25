// 多租户隔离 smoke 门禁。对一个跑着的 dev 服务(默认 :3000)注册一个全新账号,
// 断言它在各主页面看不到 canonical 演示账号(user-zyongzhu)的数据,而 canonical 自己能看到。
// 这道关专防「新用户看到别人数据」这类 bug(单元测试用一次性内存库 + canonical ctx 测不出)。
//
//   pnpm db:up && pnpm db:migrate && CREATOROS_SEED=1 pnpm dev   # 另开一个终端
//   node frontend/scripts/smoke-tenant-isolation.mjs             # 退出码 0=隔离正确,1=泄漏
//
// 依赖:dev 连真 Postgres(DATABASE_URL)且已 seed(CREATOROS_SEED=1)、canonical 账号存在。
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
// 每页一个 canonical 标记串:canonical 账号该看到、全新账号绝不该看到。
// 只收列表型页面(渲染条目名,可断言);dashboard 型(/knowledge /experience 渲染聚合
// 指标、不列条目标题)用同一套 ctx 注入修复,但本 title-marker 法测不了,故不在此门禁内。
const CHECKS = [
  { path: "/projects", marker: "AI Native Browser" },
  { path: "/positioning", marker: "AI Native Browser" },
  { path: "/topics", marker: "AI Native Browser" },
  { path: "/assets", marker: "AI Native Browser" },
];

const cookieOf = (res) => (res.headers.get("set-cookie") ?? "").split(";")[0];

async function main() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const reg = await fetch(`${BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `smoke-${stamp}@t.local`, password: "smoke-pass-123", displayName: "smoke" }),
  });
  if (reg.status !== 200) throw new Error(`register failed: ${reg.status}`);
  const cNew = cookieOf(reg);

  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "zyongzhu@creatoros.local", password: process.env.CREATOROS_DEV_PASSWORD ?? "creatoros-dev" }),
  });
  if (login.status !== 200) throw new Error(`canonical login failed: ${login.status}`);
  const cCanon = cookieOf(login);

  const hasMarker = async (path, marker, cookie) => {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "follow" });
    return { status: r.status, has: (await r.text()).includes(marker) };
  };

  let failed = 0;
  for (const { path, marker } of CHECKS) {
    const n = await hasMarker(path, marker, cNew);
    const c = await hasMarker(path, marker, cCanon);
    const ok = !n.has && c.has;
    if (!ok) failed += 1;
    console.log(`${ok ? "✓" : "✗"} ${path.padEnd(13)} newUser.has=${n.has}(${n.status})  canonical.has=${c.has}(${c.status})`);
  }
  if (failed) {
    console.error(`\n✗ 租户隔离 FAILED:${failed}/${CHECKS.length} 个页面泄漏了 canonical 数据给新账号。`);
    process.exit(1);
  }
  console.log("\n✓ 租户隔离通过:新账号在所有受测页面均看不到 canonical 数据。");
}

main().catch((e) => {
  console.error("smoke error:", e.message);
  process.exit(2);
});
