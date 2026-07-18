# 腾讯云 CDN/EdgeOne 藏源站 + 挡 DDoS 配置清单(T-406)

> 目标:把 `license.aitongban.cloud`(激活验签)/ `creatoros.aitongban.cloud`(官网/提示词包)放到 CDN 后面,**隐藏源站真实 IP** + **DDoS 缓冲** + **WAF/限流**。
> 前提:源站是腾讯云服务器(源站 IP = `152.136.151.58`,见 activate/page.tsx 注释)。
> **诚实边界**:CDN 只是"藏 IP + 挡量 + 限流",不是城墙;真正的信任根是 Ed25519 端到端签名(CDN 伪造不了授权响应)。

---

## 0. 选型:用 EdgeOne(腾讯云新一代,推荐)还是 CDN?

- **EdgeOne(边缘安全加速平台)** = CDN + WAF + DDoS + Bot 管理一体,**是本场景首选**(license API 是动态接口 + 要安全防护,普通 CDN 只加速静态)。
- 腾讯云"内容分发网络 CDN" 更偏静态加速,动态接口 + 安全能力弱。
- **本清单按 EdgeOne 写**;若只买了 CDN,安全部分(WAF/限流)需另配"Web 应用防火墙 WAF"。

---

## 1. 接入域名到 EdgeOne(藏 IP 的第一步)

1. 腾讯云控制台 → **EdgeOne** → 添加站点 → 输入 `aitongban.cloud`(顶级域,一次接入覆盖子域)。
2. 接入方式选 **NS 接入**(把域名 DNS 服务器改成 EdgeOne 分配的两个 NS,在你的域名注册商处改)——NS 接入后,`*.aitongban.cloud` 的解析权归 EdgeOne,源站 IP 不再出现在公开 DNS。
   - 若不想换 NS,可用 **CNAME 接入**:给 `license.aitongban.cloud` 加加速服务后,把它 CNAME 到 EdgeOne 给的 `xxx.eo.dnse.com`。**注意**:CNAME 接入下别再留 A 记录直指源站 IP(否则真 IP 还在 DNS 里,白藏)。
3. 为 `license.aitongban.cloud` 和 `creatoros.aitongban.cloud` 分别添加 **域名服务/加速域名**,**源站类型 = IP**,填源站 `152.136.151.58` + 源站端口(你的服务实际端口,docker-compose 里 `127.0.0.1:3000` → 若只监听 127.0.0.1 需改成监听内网/公网口给 CDN 回源,见 §3)。

## 2. HTTPS(证书)

- EdgeOne 侧配 `license.aitongban.cloud` 的证书(可用 EdgeOne 免费证书或传你现有证书)。
- **回源协议**:建议 HTTPS 回源(EdgeOne↔源站也加密);源站需有证书(可用同一张)。
- 客户端连的是 `https://license.aitongban.cloud` → EdgeOne 边缘,不变(license.rs 里域名不用改)。

## 3. ⚠️ 最关键一步:源站防火墙只放行 CDN 回源 IP(不做=白藏)

**攻击者一旦从历史 DNS/证书透明日志/扫描查到源站真 IP `152.136.151.58`,可直接绕过 CDN 打你。必须堵死。**

1. 拿到 EdgeOne **回源 IP 段**:EdgeOne 控制台 → 站点 → 安全 → 有"回源 IP 网段"列表(或工单获取);腾讯云文档有公开回源段。
2. 腾讯云 **安全组**(源站 CVM 绑定的安全组):
   - 入站规则:**只允许 EdgeOne 回源 IP 段** 访问源站服务端口(如 443/3000);
   - **删除/收紧** `0.0.0.0/0` 对服务端口的放行;
   - SSH(22)只留你自己的运维 IP。
3. 加固(可选但推荐):EdgeOne 支持**回源鉴权/私有回源**(在回源请求里带只有 EdgeOne 和源站知道的 header/token),源站校验该 header,没有就拒——这样即便真 IP 泄露 + 有人伪造回源段,也进不来。源站 nginx 加一条 `if ($http_x_eo_token != "<密钥>") { return 403; }`。

## 4. 动态 license 接口:关缓存(必须)

- license 接口每次带 nonce + 签名,**绝不能缓存**(缓存了会返回旧 nonce/旧签名 → 客户端防重放拒绝 + 授权错乱)。
- EdgeOne → 缓存配置 → 对 `license.aitongban.cloud/api/*` 设**"不缓存 / 缓存 TTL=0 / 遵循源站 no-store"**。
- 源站响应已带 `Cache-Control: no-store`(activation-manager 若没设,加上)。
- `creatoros.aitongban.cloud`(静态官网/提示词包)可正常缓存,提速。

## 5. WAF + 限流(挡撞库/刷接口)

- EdgeOne → 安全 → **Web 防护**:
  - **速率限制**:对 `/api/license/activate`、`/api/license/status`、`/api/app/latest-version` 设 per-IP 限频(如 单 IP 60 次/分钟),超限拦截或人机校验。
  - **CC 防护 / DDoS**:开启自适应(EdgeOne 默认含基础 DDoS 缓解)。
  - **托管规则/Bot**:开基础规则集挡常见扫描。
- 别把限流设太紧误伤正版(内测心跳 60min,正常用户请求量很低,限频可以宽松只挡异常爆发)。

## 6. 签名体系兼容性核对(我方代码侧,不用改但要确认)

- Ed25519 签名覆盖 `(request-target) + host + date + digest`(见 apidocs §11.2)。CDN 回源/透传时:
  - **body 必须原样透传**(EdgeOne 代理默认不改 body;别开"响应体改写/压缩改写签名头")→ digest 不变,验签过。
  - `X-License-Date` / `X-License-Signature` / `X-License-Digest` 三个响应头必须**原样透传**(EdgeOne 默认透传自定义响应头;别配删这些头)。
  - `host` 段:签名串里的 host = 客户端请求的 Host(`license.aitongban.cloud`),经 CDN 到源站 Host 不变即可(回源 Host 保持 = 加速域名)。
- **验证**:配好后,客户端(strict 验签默认已开)能激活成功 = 签名穿过 CDN 完好;失败先查 §4 缓存和响应头透传。

## 7. 我能帮的部分

- **源站防火墙锁 CDN 回源段(§3)**:你把 EdgeOne 回源 IP 段发我 + 给我源站 ssh(或你照我给的 `ufw`/安全组规则自己敲),我可以生成精确的安全组/iptables/nginx 回源鉴权规则。
- **源站 no-store / 回源鉴权 nginx 片段**:我可以直接写好给你贴。
- **验证脚本**:配完后我写个 curl 脚本验"绕过 CDN 直连源站真 IP 应被拒 + 走 CDN 能激活",证明藏 IP 真生效。

## 8. 落地顺序(建议)

1. EdgeOne 接入域名(§1)+ 证书(§2)→ 先让 CDN 跑起来、客户端能正常激活(§6 验证)。
2. **再锁源站防火墙(§3)**——顺序很重要:先确认走 CDN 通了,再锁真 IP,否则锁早了自己也连不上调试。
3. 关 license 接口缓存(§4)+ WAF 限流(§5)。
4. 回源鉴权(§3.3)收尾加固。
