# deploy FAQ / 排障

本页只收录高频部署与排障问题；部署命令与环境变量见 [README.md](README.md)，安全边界见 [../SECURITY.md](../SECURITY.md)。

## 1. 为什么在线预览不能当正式服务用？

在线预览只用于体验 UI 与转换流程，不适合提交真实节点、敏感订阅或长期保存短链数据。日常使用请自部署，并把数据保留在你自己的设备或 VPS 上。

## 2. 部署后应该打开哪个地址？

默认一体化 Compose 部署后，浏览器访问：`http://<device-ip>:<host-port>/`。

若你前面有 Nginx / Caddy / CDN / 反向代理，对外访问地址应以你的公开入口为准；此时通常还需要显式设置 `USER_FACING_BASE_URL`，否则生成的链接可能仍指向内网主机名或错误协议。

## 3. 为什么生成的链接主机名不对，或者把 `https` 变成了 `http`？

最常见原因有两个：

1. 没有设置 `USER_FACING_BASE_URL`
2. `TRUSTED_PROXY_CIDRS` 没覆盖真实反代 peer，导致应用不信任 `X-Forwarded-*`

固定公网域名、HTTPS 反代、多入口访问时，优先显式设置 `USER_FACING_BASE_URL`；只有单入口直连时才建议依赖自动推断。

## 4. 可以把 `subconverter` 也直接暴露到公网吗？

不建议。当前推荐模型是：只暴露 `app` 的 HTTP 入口，`subconverter` 只在私有网络或容器网络内被 `app` 调用。若直接对外暴露 `subconverter`，你需要自己承担额外的访问控制、流量治理与拓扑泄露风险。

## 5. 为什么模板 URL 被拒绝？

当前默认拒绝指向 loopback、link-local、RFC1918/ULA、多播、未指定地址等私有或保留地址的模板 URL。这是为了降低 SSRF 风险。

如果你确实在可信自部署环境中需要访问内网模板源，才设置 `TEMPLATE_ALLOW_PRIVATE_NETWORKS=true`；公网或不可信输入场景不建议开启。

## 6. 可以把读写限速设为 `0` 吗？

只建议在本地调试或完全可信的内网环境这样做。对外入口不要把 `WRITE_REQUESTS_PER_MINUTE` 或 `READ_REQUESTS_PER_MINUTE` 设为 `0`；若确实需要放宽，优先逐项调大限额，并继续依赖反代或网关层限速。

## 7. 怎样避免短链在重建容器后丢失？

保留默认命名卷 `short-link-data`，不要删卷；若你改了数据库路径，也要确保 `CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH` 指向持久化存储，而不是容器临时层。

## 8. 双 Docker 分离部署时最容易填错什么？

最常见的是混淆三个地址：

- `USER_FACING_BASE_URL`：浏览器和最终用户看到的公开入口
- `SUBCONVERTER_UPSTREAM_BASE_URL`：`app -> subconverter`
- `SUBCONVERTER_FACING_BASE_URL`：`subconverter -> app`

`USER_FACING` 不能填成 `http://app:11200` 这类容器内部地址；后两者则必须填双方实际可互访的内部地址。

## 9. 最小排障顺序是什么？

先看这三步：

1. `docker compose ps`
2. `curl "http://127.0.0.1:<host-port>/healthz"`
3. 浏览器访问公开入口，确认首页能打开

若是第三方设备或公网部署，再补一轮 [README.md](README.md) 里的 Playwright smoke；若仍异常，再回头核对 `USER_FACING_BASE_URL`、`TRUSTED_PROXY_CIDRS`、持久卷与模板 URL。