# T-450 完整性清单抽样校验 —— 调研 + 实施方案

- 日期:2026-07-21
- 触发:T-450(BACKLOG line 13)—— 把 CreatorOS 桌面包"只查 sidecar/frontend/server.js"的入口哈希扩到"关键清单 SHA-256 抽样校验",让攻击者不能任意 patch `.jsc` 或依赖 dylib/dll 后拉起 sidecar
- 前置真值:[打包与防逆向优化调研 §4.3](2026-07-21-packaging-and-anti-reversing-optimization-research.md) + [ladder §9 gate-F4](2026-07-18-anti-reversing-defense-ladder-design.md) 诚实边界(T-372 L2「只防 JS 层入口篡改」)
- 输出用途:落 SPEC 前的方案对账;**本文不写代码,只给伪代码级方案 + 归档对比表 + 坑目录**
- 参照文件:
  - `frontend/src-tauri/build.rs`(68 行 · 现全文)
  - `frontend/src-tauri/src/lib.rs:475-560`(`verify_file_sha256` / `verify_sidecar_tarball` / `verify_direct_sidecar_dir_with_hash`)
  - `frontend/src-tauri/src/lib.rs:643-712`(`resolve_sidecar_dir`,Windows 直装 vs mac/linux tar 解压两路)
  - `frontend/src-tauri/Cargo.toml`(已有 `obfstr=0.4.6` · `sha2=0.10` · `rand=0.8` · `machine-uid=0.5`,无需新依赖)
  - `frontend/scripts/desktop/build-sidecar.mjs`(1683 行 · `SIDECAR_RUNTIME=src-tauri/sidecar/`)

---

## 0. 一句话结论

- **抽样种子**:HKDF(`obfbytes!` 秘密上下文) 派生自 `machine_id ‖ hour_bucket`,`SmallRng::seed_from_u64` 展开为 N 个不放回索引。**不用 `thread_rng`**(每次随机 = 攻击者一发 exploit 有 (M-N)/M 概率漏检 = 5.5% 每次,不够狠;且抽样结果任意造成假阴性无法复现测试),**不用纯 machine_id 定型**(同机器同 hour 内确定 → 攻击者一旦逆出秘密就永久绕过)。
- **N=12**:冷启动 IO 主导(每文件 SSD ~5-20 ms),12 项 60-240 ms;Sidecar 启动本就 2-5 s,占比 <5%,红队 §4.3 认为的「N=8~16 是平衡点」中位偏保守值,给未来扩清单留余量。
- **mac/linux 侧也要升级**:当前 tar 整体 hash **只在解压前**做一次;之后 `.tarball-stamp` 复用机制让攻击者可以直接 patch 已解压的 `<appDataDir>/runtime/<ver>/sidecar/**/*.jsc`,下次启动跳过重新解压 = **hash 校验完全绕过**。**这是本次调研发现的、SPEC 之前未点名的隐性洞**,T-450 一并收口。
- **建议实施边界**:
  - **必做**:manifest 生成(build.rs)+ 抽样运行时校验(lib.rs,Windows + mac/linux 双路)+ XOR-混淆 manifest blob(避免 `.jsc` 相对路径明文列表可 `strings` 出)。
  - **不做**:hash Rust 壳自身(鸡蛋问题 —— 编译前无法内嵌自己的 hash,需要 post-build patcher 打洞注入,是单独一个子系统,收益 < 成本);Chromium/ffmpeg/Playwright chromium bin 等大二进制不入清单(数百 MB 冷启动 hash 会破 UX,且已被 T-437/T-284 co-ship 链的机制保护)。

---

## 1. 现状盘点(2026-07-21 事实基础)

| 平台 | 构建期哈希 | 运行时校验点 | 覆盖 | 攻击面残留 |
|---|---|---|---|---|
| mac/linux | `build.rs:40` 对 `sidecar.tar.gz` 全文件 SHA-256 → `CREATOROS_SIDECAR_SHA256` | `lib.rs:520 verify_sidecar_tarball` **解压前**一次 | 只防 tar 篡改 | **已解压 `<appDataDir>/runtime/<ver>/sidecar/**` 被 patch 后,`.tarball-stamp` 复用跳过重解压 → 后续启动完全不再校验** |
| Windows | `build.rs:48` 对 `sidecar/frontend/server.js` 单文件 SHA-256 → `CREATOROS_SIDECAR_ENTRY_SHA256` | `lib.rs:537 verify_direct_sidecar_dir_with_hash` 每次启动 | 只防 server.js 篡改 | 292 个 `.jsc` + 依赖 dll + node_modules 全线不查 |

**两处共同软肋**:攻击面里的**依赖 dll/dylib/so**(`sidecar/lib/*.dylib`、`onnxruntime.dll`、`libnode.NNN.dylib` 等)从未被任何构建期哈希覆盖过。

---

## 2. 对比表:三条候选路线(含被否决项)

| 方案 | 采纳/弃用 | 冷启动开销 | 抗动态旁路 | 单点故障 | 工程量 | 理由 |
|---|---|---|---|---|---|---|
| **A. 抽样清单 + 秘密派生 seed**(本 SPEC 采纳) | **采纳** | ~100 ms | 中(N=12,每次抽 12/300) | 抽样点是 patch 目标 | 1~2 天 | 用户拍板,cost/benefit 最优;失败即拒 spawn |
| B. 全量清单校验(每启动 hash 全部 292 `.jsc`) | 弃用 | ~500-1500 ms(实测同规模 Next) | **高**(必检) | 全量点是单点 patch 目标 | 1 天 | 用户机冷启动 UX 恶化;不比 A 更抗 patch(攻击者只需 patch 掉 verify_all 那段) |
| C. Merkle 树 + 根 hash(单叶换根变) | 弃用 | 抽样等价,但要额外存中间节点 | 与 A 同 | 攻击者仍需改根 hash 常量 = 与 A 同 | 3~5 天 | 除非做零知识证明(不搞),额外结构无收益 |
| D. `thread_rng` 每次真随机抽样 | 弃用(被否决形态①) | 与 A 同 | **低**:攻击者 patch 1 文件,单次漏检率 (M-N)/M ≈ 96%;20 次平均才 68% 检出 | 抽样结果不可复现,回归测试失锚 | ~同 A | 用户机 20 launches 才必发,期间攻击者拿数据跑路了 |
| E. 单纯 machine_id 派生 seed(无 hour 轮换) | 弃用(被否决形态②) | 与 A 同 | 低-中 | 攻击者本机逆出 seed → **永久固定绕过** | ~同 A | 缺时间轮换 = 一次逆向永久买断 |
| F. 全量 hash 存 rustc-env(`env!()`) | 弃用 | build.rs 生成慢 | 与 A 同 | Windows env 长度 32 KB 上限,~25 KB 清单会挤爆其它 env | ~同 A | rustc-env 不适合大 blob;`include_bytes!(OUT_DIR)` 才是正解 |

---

## 3. 采纳方案 A 的技术要点

### 3.1 清单内容(build.rs 生成范围)

**入选**(build 完的 `sidecar/` 下相对路径):
1. `frontend/server.js`(现有兜底,继续保留)。
2. `frontend/.next/server/chunks/**/*.jsc`(T-419 L3 字节码,~292 个)。
3. `frontend/.next/server/chunks/**/*.js` stub(bytenode 生成的加载器 stub,~294 个;也是攻击者 patch 处 —— 替换 stub 里的 `require()` 指向别处即绕过字节码保护)。
4. `frontend/.next/server/app/**/*.js`(路由 handler,~50 个;混淆过但攻击者 patch 掉可注入 API)。
5. `sidecar/lib/*.{dylib,so,dll}` + `sidecar/frontend/node_modules/.pnpm/**/onnxruntime*.{dylib,dll,so}` + `.pnpm/**/build/Release/*.node`(dlopen 目标 —— patch native binding 是攻击 hook 授权的隐蔽路径;数量 mac ~30、win ~10、linux ~5)。
6. `sidecar/frontend/instrumentation.js`(Next 启动钩子,注入 handshake 校验的地方;高价值靶点)。

**明确不入选**(诚实边界):
- Chromium 浏览器二进制(~341 MB,冷启动 hash 会破 UX,且渲染进程与 Rust 壳无信任边界)。
- ffmpeg 静态(~30 MB,不承载业务代码)。
- Playwright 浏览器 profile 数据、fonts、locales(非代码)。
- Rust 壳自身(鸡蛋问题,见 §4.3)。

规模估算:约 700 项条目 × (相对路径 avg 60 B + hash 32 B + 长度前缀 2 B) ≈ **65 KB manifest**。`include_bytes!` 完全能吃。

### 3.2 manifest 格式(build.rs 输出 → lib.rs 读入)

```
[magic:4B = "CIm1"]  // integrity manifest v1
[record_count:u32 little-endian]
[for each record]:
   [path_len:u16][path_utf8_bytes][hash:32B]
[end]

XOR-mask 整个 blob(除 magic 4B)with 一段 obfbytes!(b"…16B 随机静态密钥…") 循环 XOR。
```

存放位置:`$OUT_DIR/integrity-manifest.bin`,lib.rs 用 `include_bytes!(concat!(env!("OUT_DIR"), "/integrity-manifest.bin"))` 拉入 static blob。运行时 XOR-unmask 后 parse。

为什么 XOR:manifest 里的相对路径 `frontend/.next/server/chunks/xxxx.jsc` **可被 strings 出**。攻击者虽然 `dir` 也能列到,但 XOR 让「哪些路径进了清单」这个信息不能一眼看到 —— 抬 recon 门槛(不是加密,是打乱)。obfstr 只能吃字面 byte 常量,吞不了 `include_bytes!`,故手写 XOR。

### 3.3 抽样种子派生(灵魂在此)

```rust
// obfstr 藏死秘密上下文,attach lldb 前 attacker 拿不到明文
static SAMPLE_CTX: &[u8] = obfbytes!(b"creatoros-sample-v1");

fn derive_sample_seed(machine_id: &str) -> u64 {
    let hour_bucket: u64 = SystemTime::now()
        .duration_since(UNIX_EPOCH).unwrap().as_secs() / 3600;
    let mut hasher = Sha256::new();
    hasher.update(SAMPLE_CTX);
    hasher.update(machine_id.as_bytes());
    hasher.update(&hour_bucket.to_le_bytes());
    let h = hasher.finalize();
    // 取前 8 B 作 u64 seed;SmallRng 展开为不放回抽样。
    u64::from_le_bytes(h[..8].try_into().unwrap())
}
```

**性质**:
- **每机器不同**:攻击者在自己机器逆出的样本索引 ≠ 目标机器的样本索引(machine_id 是 IOPlatformUUID/MachineGuid,每机器不同)。
- **每小时轮换**:即便攻击者动态跑 lldb 在 t=0h 逆出当前 12 个索引 & patch 掉,t=1h 换 12 个新的 → 攻击窗口只有 1 小时。
- **不用 OsRng**:抽样不是加密操作,不需要不可预测熵,只需要**攻击者不可预测**;`SAMPLE_CTX` 秘密 obfstr 藏起 = 攻击者不知道 seed 派生函数就构造不出对应 machine_id 的样本。
- **测试可复现**:测试环境固定 machine_id + mock hour → 抽样索引确定,单测可断言。

### 3.4 抽样 & 验证核心

```rust
fn integrity_sample_verify(sidecar_root: &Path, machine_id: &str) -> Result<(), String> {
    const N: usize = 12;
    let manifest = decrypt_manifest_blob(MANIFEST_BLOB);   // XOR-unmask
    let records = parse_records(&manifest)?;               // Vec<(String, [u8;32])>
    if records.is_empty() {
        return Err("构建期未内嵌完整性清单,拒绝运行".into());  // 与 verify_file_sha256 一致
    }
    let seed = derive_sample_seed(machine_id);
    let mut rng = SmallRng::seed_from_u64(seed);
    let picks: Vec<usize> = sample_without_replacement(&mut rng, records.len(), N);
    for i in picks {
        let (rel, expected) = &records[i];
        let path = sidecar_root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        verify_file_sha256_bin(&path, expected, rel)?;   // 复用现有 sha256 helper 的二进制版
    }
    Ok(())
}
```

### 3.5 接入点(lib.rs 现有代码微创)

- **Windows** `verify_direct_sidecar_dir(dir)` 尾部追加 `integrity_sample_verify(dir, machine_id)?`(machine_id 在 `resolve_machine_id` 之后已可用,`resolve_sidecar_dir` 调用时把 machine_id 一起传下来,或走 `OnceCell` 缓存)。
- **mac/linux** `verify_sidecar_tarball(tar)` 之后 `extract_sidecar_tarball` 之后 —— 新增 `integrity_sample_verify(&extracted_sidecar_dir, machine_id)?`。**关键**:这里补的是「.tarball-stamp 复用后不再重新校验解压树」的现存洞;哪怕 tar 没变,已解压的树也每次启动抽样校验。

### 3.6 build.rs 侧改动

```
build.rs 追加 ~40 行:
1. walk sidecar/ 收集入选路径(§3.1)
2. 对每个文件跑 sha2::Sha256(复用现有 sha256_file 助手)
3. 序列化为 §3.2 格式,XOR-mask
4. 写 $OUT_DIR/integrity-manifest.bin
5. println!("cargo:rerun-if-changed=sidecar")  // 目录级(cargo 支持)
```

mac/linux 有个时序坑:build-sidecar.mjs 打完 tar 之后**才**跑 cargo → 此时 `sidecar/` 目录仍在(打 tar 不删源)= build.rs 可以直接读。**必须**校验:mac 出包脚本不能在 tar 打完就删 `sidecar/`(检 build-sidecar.mjs 现行代码 —— 未见 tar 打完删源目录逻辑,安全)。

Windows 直装:build.rs 走 `sidecar/` 现路径,天然可用。

---

## 4. 三处最容易踩的坑

### 4.1 时序坑:manifest 生成早于混淆/字节码

现流水线(见 `frontend/scripts/desktop/package.mjs` 头注释):
`build-sidecar → obfuscate → bytecode → decoy → legal-stamp → smoke → tauri build`

`tauri build` 阶段 `beforeBuildCommand` 再跑 build-sidecar.mjs(但 `CREATOROS_SKIP_SIDECAR_REBUILD=1` 短路,只重打 tar)→ **cargo build 阶段 build.rs 看到的 sidecar/ 是已混淆已字节码的最终态**。这是 T-450 的隐含前提。

**踩坑姿态**:如果 build.rs 提前跑或误加了 `beforeBuildCommand=build.rs` 之类的乱序,manifest 会包含**未混淆版**的 hash,用户机上跑混淆版必假阳性拒 spawn。CI 需加冒烟:build 完 dump `manifest 里前 3 条 hash` vs `实际 sidecar/frontend/server.js 的 hash`,一致才放行。

### 4.2 Windows 路径分隔符:manifest 存 `/`, 运行时 join 要转 `\`

`Path::join` 在 Windows 上接受 `/` 分隔的相对路径**通常**能解析,但**存在**边缘 case:①UNC 路径(`\\?\C:\...`)拼 `/` 段会失败;②某些 API 严格要求 backslash。

**踩坑姿态**:manifest 记录用 `/`(跨平台一致 = 单一实现),运行时用 `rel.replace('/', std::path::MAIN_SEPARATOR_STR)` 或走 `rel.split('/').fold(sidecar_root, |p, seg| p.join(seg))`。单测覆盖 Windows 长路径(> 260 字符,`.next/server/chunks/vendor-chunks/xxxx.jsc` 很容易超) —— 现有 CI 有 Windows CI 跑集成测试,能兜底。

### 4.3 鸡蛋问题:不能 hash Rust 壳自身

User 原始 SPEC 说清单含「Rust 壳自身」。这在编译期做不到:
- Rust 壳的 hash 依赖它自己的最终二进制内容;
- 但内容里要嵌 hash → hash 自变;
- 自嵌 hash 需 **post-build patcher**(类似 updater 用 minisign 签名后 patch 二进制的最后 64 字节),是**独立子系统**(1~2 周工程)。

**T-450 v1 边界**:**不 hash Rust 壳**,honestly note 这个洞。补偿手段:
- mac:Rust 壳在 `codesign.mjs` 阶段被 codesign(有条件 —— 内测未签,但正式出包会签)。签名破坏 = launchd 拒绝启动。
- Windows:Rust 壳在 `Program Files\CreatorOS\` 系统目录,普通用户 patch 需 UAC 提权 → 抬门槛(不消除);未来补 `signtool.exe` 签名(Authenticode)进一步硬化。
- Linux:无原生签名机制,是 SPEC ladder §9 明确的诚实边界。

若未来要补:走 post-build patcher 方案 = build.rs 输出一个「预留 40 B `[0u8; 40]` slot 存 self-hash 用」→ tauri build 后,`package.mjs` 尾部跑一次 `computeSha256(exe)` → seek 到 slot(通过 magic marker 定位)→ 覆写。这是**未来 T-45X 独立任务**,不进 T-450。

---

## 5. 冷启动开销预估

| 情形 | N | 每文件平均 SHA-256 计算 | 每文件 IO(未预热) | 每文件 IO(已预热) | N 项总耗时 |
|---|---|---|---|---|---|
| 抽样 v1(SSD + 无 AV 扫描) | 12 | ~0.5 ms(50 KB `.jsc`) | ~5 ms | ~0.5 ms | **~66 ms 冷 / ~12 ms 热** |
| 抽样 v1(SSD + Windows Defender 实时扫描) | 12 | ~0.5 ms | ~15-30 ms(defender 中断) | ~1 ms | **~180-360 ms 冷 / ~18 ms 热** |
| 抽样 v1(HDD) | 12 | ~0.5 ms | ~30-80 ms(seek 主导) | ~2 ms | **~360-960 ms 冷 / ~30 ms 热** |
| 全量对照(N=700) | 700 | ~0.5 ms | ~5 ms | ~0.5 ms | **~3.9 s 冷(不可接受)** |

参照:sidecar 冷启动本身 ~2-5 s(node 启动 + Next server 装配 + PGlite bootstrap)。抽样 v1 冷启动最坏 ~360 ms(Windows Defender)= 增幅 ~7-18%,肉眼可感但可接受。

**优化余地**:抽样验证可并行(`std::thread::scope` 或 rayon 无必要 —— 12 项开线程池反而增开销;顺序即可)。如果实测超预算 500 ms,把 N 调到 8 即降到 240 ms。

---

## 6. 实施边界(建议 SPEC 落法)

**v1 必做**(1~2 天):
- build.rs 生成 manifest(§3.1 入选范围)。
- lib.rs XOR-unmask + parse + `derive_sample_seed` + `integrity_sample_verify`。
- **两路都接**:Windows `verify_direct_sidecar_dir` 尾部 + mac/linux `resolve_sidecar_dir` extract 后新增一次。
- 单测:①manifest parse ②固定 machine_id + hour 抽样索引可复现 ③一个文件被篡改 → 抽样命中它时返回 Err ④manifest 空(dev 构建)诚实 Err 而非静默通过。
- 集成测试(现有 `windows_安装目录展开资源关键结构与入口哈希都必须通过` 同 pattern):模拟 patch `.jsc` → 抽样验证 fail。

**v1 不做**(留后手):
- **不 hash Rust 壳自身**(§4.3;鸡蛋问题,独立子系统)。
- **不动 obfstr 藏整个 manifest**(65 KB 常量 obfstr 编译期扩起飞 & 增二进制体积;XOR-mask 已够)。
- **不接 T-372 L2 现有入口 hash**(叠加不冲突 —— 现有 `CREATOROS_SIDECAR_ENTRY_SHA256` 保留,抽样是补充;两条链任一失败即拒 spawn,总攻击面严格 ≤)。
- **不改 mac tar hash 逻辑**(继续算 tar 整体 hash 作解压前门 —— 已是 T-372 L2 落地防线,不动;抽样是**解压后**新增第二把锁)。

---

## 7. 诚实边界(SPEC §9 gate-F4 语气延续)

- **攻击者仍可 patch Rust 壳这段验证逻辑本身**。SPEC ladder §9 line ~120 已定 = 可接受(需 attach lldb / patch mach-o/PE + 重签,不再是 grep AI 分钟级)。
- **obfstr 只藏静态常量**(SAMPLE_CTX、XOR 密钥);运行时 walk sidecar/、hash 文件、比对样本 —— 这些操作在 `.text` 段,lldb attach 断在 `integrity_sample_verify` 入口即可读全部逻辑。这在 SPEC ladder §9 已经写明**属可接受边界**。
- **N=12 抽样 = 概率保护**:攻击者 patch 1 文件,当次不被抽中概率 = (M-N)/M ≈ 98%;patch k 个文件的**当次逃脱**概率 = C(M-k,N)/C(M,N)。k=1 时 96%,k=10 时 ~65%,k=50 时 ~10%。**大规模 patch(k>30)几乎必然被抓**;小规模精修(k<5)可能过关但**每小时 seed 轮换**要求他每小时重新精修 —— 不可持续。
- **共享公钥/单机场景**:如果攻击者拿到用户 machine_id + 逆出 SAMPLE_CTX,可在离线环境精准算出该用户当前 12 个索引 → 精确避坑。**这是理性接受的**:攻击者已达到「知道 obfstr 里所有 obfbytes」的能力,他已经能改任何 obfbytes 常量。抽样不是抵挡这种攻击者的防线 —— 抬门槛的是它把「哪些文件在被查」从「静态可见的一个 `verify_file_sha256("server.js")` 调用」抬到「运行时动态派生的一组索引」。

---

## 8. 与已有防线关系

| 已有防线 | 是否冲突 | 如何叠加 |
|---|---|---|
| T-372 L2 tarball hash(mac/linux) | 不冲突 | 保留 —— 抽样是**解压后**新增第二把锁,解压前 tar hash 不动 |
| T-372 L2 server.js entry hash(win) | 不冲突 | 保留 —— server.js 也是 manifest 里的一项;两条独立检 |
| T-419 L3 bytenode 字节码 | 强化 | 抽样把 `.jsc` 入清单 = 谁篡改字节码谁露馅;bytenode + 抽样两把锁 |
| T-399b 蜜罐授权门 | 不冲突 | 蜜罐是**引导错误分析**,抽样是**堵实际篡改**;正交 |
| T-437 mac dylib @rpath 自包含 | 不冲突 | `sidecar/lib/*.dylib` 入清单;dylib 篡改会被抽样抓 |
| T-408 handshake token | 不冲突 | handshake 是**运行时通信凭证**,抽样是**启动前静态校验**;正交 |
| PRODUCT 反调试(mac PT_DENY_ATTACH) | 不冲突 | 反调试保护整个 Rust 壳(含 `integrity_sample_verify` 逻辑);两者串行叠加 |

---

## 9. 交付清单(供 SPEC 拆 Task 参考)

按 CLAUDE.md 铁律:**SPEC 一次 0→1 做完,不切阶段**。整体工程量 1~2 天,拆一条 Task 即可。

若 SPEC 走 review gate(改信任边界 —— 抽样种子引入 `machine_id` 作为完整性判定输入,属于**信任根扩展**),reviewer 关注点建议:
1. §3.3 seed 派生是否泄露 machine_id(答:不泄露,只用作 seed 输入,不出 manifest)。
2. §3.5 接入点是否与现有校验形成短路语义(答:任一失败即返回 Err → `resolve_sidecar_dir` Err → 拒 spawn;无假通过路径)。
3. §4.3 鸡蛋问题的诚实标注是否清晰(答:见 §7 明确列了不 hash Rust 壳自身)。
4. mac/linux 解压后新增校验是否会拖慢首启(答:首启多 66 ms 冷 / 12 ms 热,可接受)。

---

## 附:核心事实索引

- 现有 build.rs 全文 68 行:`frontend/src-tauri/build.rs`
- 现有 verify 三兄弟:`frontend/src-tauri/src/lib.rs:481 verify_file_sha256` / `:518 verify_sidecar_tarball` / `:537 verify_direct_sidecar_dir_with_hash`
- resolve_sidecar_dir Windows/mac 分支:`frontend/src-tauri/src/lib.rs:643-712`
- machine_id 派生:`frontend/src-tauri/src/lib.rs:307-345 resolve_machine_id`
- obfstr 现有用法参照:`frontend/src-tauri/src/license.rs:67,291-297,344,390,512,582`(编译期字节混淆多处实证)
- Cargo 依赖(无需新增):`frontend/src-tauri/Cargo.toml` obfstr=0.4.6 · sha2=0.10 · rand=0.8 · machine-uid=0.5
- 打包管线时序:`frontend/scripts/desktop/package.mjs`(六步)+ `frontend/scripts/desktop/build-sidecar.mjs:1458 CREATOROS_SKIP_SIDECAR_REBUILD 短路`
- 上游研究 §4.3:`docs/research/2026-07-21-packaging-and-anti-reversing-optimization-research.md:146-151`
- ladder §9 诚实边界:`docs/research/2026-07-18-anti-reversing-defense-ladder-design.md`
