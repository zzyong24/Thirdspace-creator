# 原生真实HTTP跨仓驱动

仅隔离开发/测试编译，显式启用后执行。正式release不包含loopback配置入口，不替换 `creatoros` 烘焙产品身份，不关闭Ed25519/nonce/期限验证，不添加全局CA或调用OS凭据。普通构建/运行没有显式Lab开关仍使用官方origin。

canonical身份（driver必须显式构建）：`productRef=creatoros`、`projectKey=creatoros`、`appIdentifier=cloud.aitongban.creatoros`。Activity必须为新的隔离授权提供该projectKey的明确测试scope；不能把它改成历史 `thirdspace-t188-lab` 或通过运行时替换烘焙身份。

实际链路：Rust `Http` 正常CREATE → 本人通过隔离Growth网页批准 → 同一秘密与PKCE真实POLL → Rust既有授权链实际activate → fresh v3真实HTTP票据、原始外层签名和JWS核验 → 原生consumer核对原期限 → 真实AES加密文件原子保存/回读 → 真实ACK → 清理连接胶囊。错误公开验签钥匙必须拒绝，不写入授权文件；driver不输出授权码/secret/verifier/machineId。

公开配置示例（保存到任务目录，private目录只存测试密钥、加密胶囊及加密授权文件）：

```json
{
  "schema": "creator-owned-devices-http-lab/v1",
  "growthOrigin": "http://localhost:8872",
  "activityOrigin": "https://127.0.0.1:8850",
  "caPemPath": "/tmp/t188-devices-lab/cert.pem"
}
```

driver配置只包含公开验签钥匙：

```json
{
  "schema": "creator-owned-devices-http-driver/v1",
  "publicKeyB64": "由受控Activity Lab提供的公开32B Ed25519钥匙base64"
}
```

运行（命令中的两个JSON路径填写绝对路径，cargo测试以package目录为cwd）：

```bash
CREATOROS_LICENSE_PROJECT_KEY=creatoros \
CREATOROS_OWNED_DEVICES_HTTP_LAB=1 \
CREATOROS_OWNED_DEVICES_HTTP_LAB_CONFIG="$PWD/docs/verification/t1072/integration/http-lab-config.json" \
CREATOROS_OWNED_DEVICES_HTTP_LAB_DRIVER="$PWD/docs/verification/t1072/integration/http-lab-driver.json" \
CREATOROS_OWNED_DEVICES_HTTP_LAB_PHASE=prepare \
TAURI_CONFIG='{"bundle":{"resources":[],"externalBin":[]}}' \
cargo test --manifest-path frontend/src-tauri/Cargo.toml --lib \
  owned_devices::http_lab::live_loopback_owned_device_consumer \
  -- --ignored --nocapture --test-threads=1
```

prepare只输出短码、registrationRef、连接到期时间；秘密在当前工作树 `docs/verification/t1072/integration/private-native-lab/` 加密胶囊中。目录0700，测试密钥及胶囊0600，Git明确忽略。测试密钥是本轮独立生成的fixture密钥，不是用户OS凭据；这项隔离测试存储不替代正式产品的OS凭据journal验收。prepare重复发现胶囊时拒绝另建意向。

通过 `http://localhost:8872/products/connect#code=<本次短码>` 由新隔离owner正常批准后，把上面phase改为 `consume` 执行同一测试。consumer使用同一胶囊，不重建或重置旧码设备。全部成功后打印非秘密结果，保留加密授权输出并清理胶囊。若已经保存而ACK未确认，下一次consume只接受已验签授权与原journal的snapshot hash一致，回读后续ACK，不重复激活；journal称已保存但文件不存在或对象不一致时明确拒绝。

若未ready、scope或产品错误、签名不符、期限不符、写盘/ACK未确认，测试必须失败且留原意向与准确原因，不补拍PASS。正式Mac/Windows双机UAT仍单独待验。

本轮先前CREATE真实返回422，driver无胶囊输出。公开metadata证实debug构建未提供CREATOROS_LICENSE_PROJECT_KEY时实际烘焙projectKey为空串；build.rs在debug不默认canonical key。按上述命令明确构建creatoros后重验，未改ProductManifest、不用运行时身份覆盖。driver现在在出网前强制烘焙projectKey/productRef均为creatoros，遗漏编译变量直接失败。早期63字测试machineId与32hex均被同一422拒绝，前者符合Growth协议；当前32hex仅模拟生产指纹产物形状，种子随机、不读取硬件。

CREATE烘焙身份修正后首次已创建对象仍被旧native的ULID连接引用假设拒绝，未形成可恢复安全胶囊。主控核实权威Growth的LDR_32lowerhex shape后，SPEC及真实独立回执已更新，新增journal正向测试当场RED。随后的测试意向是有记录的失败后新建，不能称恢复先前无胶囊意向；先前意向未由owner批准，不占授权设备名额。

失败恢复：本次TTL自然到期且真实POLL410、未保存授权时，仅在主控明确确认normal owner短信移除本轮测试电脑后，允许phase=prepareAfterExpired。该phase再次校验旧journal/电脑绑定、到期、无保存标记、任何license.enc均不存在，并用原secret/PKCE真实POLL必须410；旧加密capsule原字节按canonical引用归档，不覆盖不同原归档，成功新建后才用临时600密文同步/回读及原子rename更新activecapsule。同测试machineId保持，secret/PKCE/意向是新对象，10分钟TTL从新CREATE计算；不续旧TTL、不issue新授权、不碰首机。该phase对当前Growth唯一候选真实返回409 LICENSE_SOURCE_REVIEW_REQUIRED，未生成短码，原active胶囊和归档仍在。

## GD 前向迁移后真实闭环（2026-10-09 07:02Z）

上段 409 是迁移前真实失败，保留历史。本轮主控经正式 GD 规范/独立评审，将唯一 Growth 候选服务与隔离数据库前向迁移至 0074，再明确授权同 grant / 稳定机器重新发起意向。`native-http-prepare-gd-ready.log` 真实创建 LDR_2c53f897124140b3bac5474979b6611b（10 分钟 TTL）。normal 901 正常网页明确选择原「本地设备联调30日版」授权，经短信确认；未选择最新销售 profile、未换码。

`native-http-consume-gd-ready.log`：实际 Rust Http 1 passed / exit 0，ready、signatureVerified、encryptedSavedAndReadBack、acknowledged、journalCleared 均 true。实际首激 2026-10-09T05:23:35.102Z / 到期 2026-11-08T05:23:35.102Z 原样；foreignOriginRejected、untrustedCertificateRejected、wrongSigningKeyRejected 均 true，secretExposure=false。合法独立 leaf 由同显式 CA 信任；未全局信任、未关闭 TLS 或验签、未读 OS 凭据。错误公钥负例真实两次 Ed25519 拒绝，随后正确公钥消费同一批准意向成功。

当前保持这两个隔离测试设备，不额外 prepare/移除/改变 grant。这是开发编译真实网络和独立测试加密存储验收；真实安装版、正式 OS 凭据 journal、Mac/Windows 双机仍待授权和真实设备，不由此代替。
