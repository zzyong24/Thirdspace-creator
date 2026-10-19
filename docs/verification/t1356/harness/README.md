# T1356 合成采集数据 seed

本工具复用 T1355 已核验的私有 PG helper，不另起数据库或平台。T1356 使用独立 fresh mkdtemp 与独立端口；先等 `binding-fixture-server.mts` ready，再运行本工具，成功后才启动同库 Next。不能复用 T1355 正式旅程数据。

入口：`pnpm -C backend exec tsx <seed-collected-dashboard.mts绝对路径> --ready <root/ready.json> --manifest <root/dashboard-seed-safe.json>`。省略两个参数时读取 `T1355_FIXTURE_ROOT` 下同名文件；不读取通用 DATABASE_URL 或用户连接配置。ready/owner必须0600且属当前用户，根0700；验证 nonce、canonical root、精确PG dataDir/PID/端口/listen地址、helper PID、当前本机owner及仅私有127.0.0.1 URL。manifest必须留在同根。先以独占 `dashboard-seed-start.json` 登记，重复/失败根不盲重放；保留旧根，下一次用fresh root。

窗口固定为2026-10-01至2026-10-07（上海日期）。合成membership从9月1日开始，指标不可变ingestedAt为10月8日/转组后10月9日；发布时间单独冻结，不能把采集时间冒发布时间。manifest含所有真实ID、service提交attempt及固定输入期望，不含连接串或凭据。正式验收必须用实际Next persistence→HTTP→UI回读，seed本身不调用in-process dashboard代签。

| scenario | 合成输入与期望 |
| --- | --- |
| primary | XHS 11条窗内作品浏览总123/点赞0，1条旧窗外浏览999不计，1条无metric窗内目录仅不可归属覆盖；另1条独立原有XHS真实published记录+legacy views0/likes0用于recent行“次浏览”，未将目录造为项目/发布。 |
| ksOutside | 只有9月1日作品play0；10月1–7日未知，显式9月1日窗口真实0。 |
| browseZero | XHS真实浏览0/点赞0，区别未知。 |
| latestUnavailable | 旧view99后新sourceMissing/null，不退回99；旧合法likes0保留。 |
| noMetric | 目录存在但无可归属metric，catalogWorkCount0/unattributable1。 |
| transferA | Douyin真实Publication/legacy mirror引用与真实typed共存；原合法view5/likes0覆盖同key typed123/17，保原组发布及项目。 |
| transferB | 同账号真实转组后新metric200/25仅归新组，原组Publication不能吞新组值；新组Publication/项目均0。 |

账号、组、可信身份提交、collection start/claim/commit全部走现有service；所有14次source run是明确合成源的完成事实，不是对用户平台新采集。两条legacy fixture均走真实Projects.ensureImportedProject→Output→Publishing.createImportedPublication→Analytics.appendSnapshot；仅Douyin引用用现有recordConfirmedLegacyImport关联，不直写Publication DTO。没有外部publisher/模型/浏览器/平台adapter。重叠membership无法经合法service构造，因此不注入schema损坏；该族沿后端既有GREEN保护，不能冒UI已重验。

Next必须使用现成 `CREATOROS_DISABLE_BACKGROUND_DRIVERS=1`、`CREATOROS_DISABLE_SCHEDULER=1`。seed只结束自己的pool，私有helper继续服务Next；整个验收结束由helper正常SIGTERM收尾本次PG，不删除证据根。selftest-attempt01是本工具真实提交自验，尚非HTTP/浏览器收据。
