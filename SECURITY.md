# Security

## 当前范围

本文件只描述当前 **3.0 Beta / 预发布阶段** 的安全模型、默认假设与非承诺范围。

部署命令、运维建议与常见排障请看 [deploy/README.md](deploy/README.md) 与 [deploy/FAQ.md](deploy/FAQ.md)。

- 定位：可信自部署 / 内测或小范围预发布。
- 不承诺公网多租户、零信任或强对抗场景下的完整防护。
- 对外部署优先固定明确镜像 tag 或 digest，而非长期漂移滚动标签。

## 部署假设

当前实现默认假设以下条件成立：

- 由部署者自行控制运行环境与访问入口。
- 默认使用一体化 Compose 内部部署，或在双 Docker 分离部署时仍保持 `app` 与 `subconverter` 之间只通过私有可达地址通信；`subconverter` 不对外暴露。
- 若存在 HTTPS 反向代理、固定域名或多入口访问，部署者会显式设置 `CHAIN_SUBCONVERTER_USER_FACING_BASE_URL`。
- 短链接数据通过持久卷保存；无卷的临时预览环境只适合无状态测试。

如果以上任一条件不成立，应视为超出当前默认安全模型，应由部署者额外补齐网络、身份、审计与流量防护。

## 当前实现中的重要边界

### 1. 接口默认匿名

当前 UI、API、订阅读取与短链接恢复路径均默认匿名可访问。仓库当前没有内建鉴权、租户隔离或权限模型。

这意味着：

- 任何能访问服务入口的用户，都可以调用生成、恢复、短链等能力。
- 短链接应被视为“非公开但不受保护的地址”，不能视作私密凭证。

## 2. 模板 URL 会由服务端主动拉取

阶段 1 中的模板 URL 必须是 HTTP(S) 地址，服务端会主动向该地址发起请求并拉取模板内容。

当前实现只校验：

- URL 必须为 HTTP(S)
- URL 必须包含 host
- 默认模板 URL 必须合法
- 默认拒绝指向 loopback、link-local、RFC1918/ULA、多播和未指定地址的模板目标

当前仍未内建：

- 域名白名单
- 出站 egress 控制

默认情况下，若模板 URL 指向 loopback、link-local、RFC1918/ULA、多播、未指定地址等私有/保留网段，服务端会直接拒绝该请求。

同时保留一个显式开关 `CHAIN_SUBCONVERTER_TEMPLATE_ALLOW_PRIVATE_NETWORKS=true`，只给可信自部署环境访问内网模板源时使用。开启后，相当于把模板抓取能力重新暴露给私网目标，部署者需要自行承担相应风险。

因此，公网暴露或不可信输入场景仍存在 SSRF 风险；建议在可信自部署环境使用，并由部署者通过网络侧限制出站。

## 3. 对外链接推断依赖请求来源

如果未显式设置 `CHAIN_SUBCONVERTER_USER_FACING_BASE_URL`，服务端会根据当前请求来源推断公开基地址，用于长链接、短链接和订阅路径生成：默认使用当前请求的 TLS 状态与 `Host` 头；若直接对端 IP 命中 `CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS`，则会优先读取标准 `X-Forwarded-Proto` 与 `X-Forwarded-Host`。

这意味着：

- 单入口直连部署通常可以工作。
- 常见 Docker bridge + 宿主机反代场景可通过 `CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS` 改善 fallback 推断；官方 Compose 示例默认给出 `172.16.0.0/12`。若使用 `network_mode: host` 且对端为 loopback，需另行加入 `127.0.0.1/32` 等实际 peer。
- 如果前面有 HTTPS 终止反代，而应用本身只看到明文 HTTP，请务必显式设置 `CHAIN_SUBCONVERTER_USER_FACING_BASE_URL=https://<your-host>`。
- 如果该部署不希望继续依赖请求头自动推断，就应显式设置 `CHAIN_SUBCONVERTER_USER_FACING_BASE_URL`，不要留空。
- 如果公网或多入口场景下不显式设置该值，生成链接可能错误，且存在被 Host 头污染的风险。

## 4. 资源保护（基础级）

当前实现已有一些基础约束：

- 阶段 1 输入长度、URL 数量、长链接长度均有上限。
- `subconverter` 调用有超时与并发上限。
- 四个写接口共享每 IP token bucket，默认 `60 req/min`，可通过 `CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE` 调整；设为 `0` 可关闭。若直接对端命中 `CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS`，限速会按 `X-Forwarded-For` 中解析出的客户端 IP 分桶；否则按 `RemoteAddr` 分桶。
- `GET /sub` 与 `GET /sub/<id>` 共享独立的每 IP token bucket，默认 `60 req/min`，可通过 `CHAIN_SUBCONVERTER_READ_REQUESTS_PER_MINUTE` 调整；设为 `0` 可关闭。客户端 IP 识别规则与写接口一致。
- 默认模板路径有单独缓存 TTL。
- Compose 部署默认把短链接 SQLite 文件放到持久卷。

当前仍未内建：

- 审计日志与安全告警
- 安全响应头策略

因此，当前实现适合低并发、可信网络与可控流量来源。

## 部署硬化入口

若你在做实际部署，而不是只想理解安全边界：

- 部署命令与环境变量：看 [deploy/README.md](deploy/README.md)
- 常见错误主机名 / HTTPS / 模板 URL / 限速问题：看 [deploy/FAQ.md](deploy/FAQ.md)
- 当前不承诺覆盖的风险：继续看本文件下文

## 当前不承诺防护的内容

以下内容当前不在安全承诺范围内：

- 公网匿名高对抗流量防护
- 多租户数据隔离
- 恶意模板源或恶意订阅源对最终客户端的连带风险
- DDoS / CC 防护
- 完整的操作审计与取证链路

## 报告方式

当前仓库尚未配置独立安全披露渠道。发现安全问题时，请不要在公开 issue 中直接贴出可利用细节；优先通过仓库维护者可见的私下渠道沟通，或在 issue 中只报告风险类别与受影响范围，等待进一步确认后再补细节。